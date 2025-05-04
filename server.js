const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir o frontend
app.use(express.static(path.join(__dirname, 'public')));

// Redirecionar a raiz para index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {};

io.on('connection', (socket) => {
    console.log(`Novo cliente conectado: ${socket.id}`);

    socket.on('createRoom', (roomId) => {
        if (rooms[roomId]) {
            console.log(`Erro: Sala ${roomId} já existe`);
            socket.emit('error', 'Sala já existe');
            return;
        }
        rooms[roomId] = {
            players: [socket.id],
            board: Array(9).fill(null),
            currentPlayer: '❌',
            symbols: { [socket.id]: '❌' }
        };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
        console.log(`Sala ${roomId} criada por ${socket.id}`);
    });

    socket.on('joinRoom', (roomId) => {
        if (!rooms[roomId]) {
            console.log(`Erro: Sala ${roomId} não encontrada`);
            socket.emit('error', 'Sala não encontrada');
            return;
        }
        if (rooms[roomId].players.length >= 2) {
            console.log(`Erro: Sala ${roomId} cheia`);
            socket.emit('error', 'Sala cheia');
            return;
        }
        rooms[roomId].players.push(socket.id);
        rooms[roomId].symbols[socket.id] = '⭕';
        socket.join(roomId);
        io.to(roomId).emit('playerJoined');
        io.to(roomId).emit('gameState', {
            board: rooms[roomId].board,
            currentPlayer: rooms[roomId].currentPlayer,
            gameOver: false
        });
        console.log(`Jogador ${socket.id} entrou na sala ${roomId}`);
    });

    socket.on('makeMove', ({ roomId, index, symbol }) => {
        try {
            if (!rooms[roomId]) {
                console.log(`Erro: Sala ${roomId} não existe`);
                socket.emit('error', 'Sala não existe');
                return;
            }
            if (rooms[roomId].board[index] || rooms[roomId].currentPlayer !== symbol) {
                console.log(`Movimento inválido: roomId=${roomId}, index=${index}, symbol=${symbol}, currentPlayer=${rooms[roomId].currentPlayer}`);
                socket.emit('error', 'Movimento inválido');
                return;
            }
            rooms[roomId].board[index] = symbol;
            rooms[roomId].currentPlayer = symbol === '❌' ? '⭕' : '❌';
            console.log(`Movimento: sala=${roomId}, index=${index}, symbol=${symbol}, próximo=${rooms[roomId].currentPlayer}`);

            const result = checkWinner(rooms[roomId].board);
            if (result.winner || result.isTie) {
                io.to(roomId).emit('gameOver', result);
                console.log(`Fim de jogo na sala ${roomId}:`, result);
            } else {
                io.to(roomId).emit('gameState', {
                    board: rooms[roomId].board,
                    currentPlayer: rooms[roomId].currentPlayer,
                    gameOver: false
                });
            }
        } catch (error) {
            console.error('Erro ao processar movimento:', error);
            socket.emit('error', 'Erro no servidor');
        }
    });

    socket.on('resetGame', (roomId) => {
        try {
            if (rooms[roomId]) {
                console.log(`Resetando sala ${roomId}`);
                rooms[roomId].board = Array(9).fill(null);
                rooms[roomId].currentPlayer = '❌';
                io.to(roomId).emit('gameState', {
                    board: rooms[roomId].board,
                    currentPlayer: rooms[roomId].currentPlayer,
                    gameOver: false
                });
                console.log(`Jogo resetado na sala ${roomId}`);
            } else {
                console.log(`Erro: Sala ${roomId} não encontrada para reset`);
                socket.emit('error', 'Sala não encontrada');
            }
        } catch (error) {
            console.error('Erro ao resetar jogo:', error);
            socket.emit('error', 'Erro no servidor');
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.indexOf(socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                delete room.symbols[socket.id];
                io.to(roomId).emit('error', 'O outro jogador desconectou');
                if (room.players.length === 0) {
                    delete rooms[roomId];
                    console.log(`Sala ${roomId} deletada (vazia)`);
                }
                break;
            }
        }
        console.log(`Cliente desconectado: ${socket.id}`);
    });
});

function checkWinner(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], isTie: false };
        }
    }
    return board.every(cell => cell) ? { winner: null, isTie: true } : { winner: null, isTie: false };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});