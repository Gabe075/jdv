const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(express.static(__dirname));

const rooms = {};

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

io.on('connection', (socket) => {
    console.log(`Novo cliente conectado: ${socket.id}`);

    socket.on('createRoom', (roomId) => {
        if (rooms[roomId]) {
            socket.emit('error', 'Sala já existe!');
            return;
        }

        rooms[roomId] = {
            players: [socket.id],
            board: Array(9).fill(null),
            currentPlayer: '❌',
            playerSymbols: { [socket.id]: '❌' },
            gameOver: false
        };

        socket.join(roomId);
        socket.emit('roomCreated', {
            playerSymbol: '❌',
            aiSymbol: '⭕',
            firstPlayer: '❌'
        });
        console.log(`Sala ${roomId} criada por ${socket.id}`);
    });

    socket.on('joinRoom', (roomId) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', 'Sala não encontrada!');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error', 'Sala cheia!');
            return;
        }

        room.players.push(socket.id);
        room.playerSymbols[socket.id] = '⭕';
        socket.join(roomId);

        socket.emit('playerJoined', {
            playerSymbol: '⭕',
            aiSymbol: '❌',
            firstPlayer: '❌'
        });

        io.to(roomId).emit('gameState', {
            board: room.board,
            currentPlayer: room.currentPlayer,
            gameOver: room.gameOver
        });

        io.to(roomId).emit('statusUpdate', `Sala: ${roomId} | Sua vez: ${room.currentPlayer === room.playerSymbols[socket.id] ? 'Sim' : 'Não'}`);
        console.log(`Cliente ${socket.id} entrou na sala ${roomId}`);
    });

    socket.on('makeMove', ({ roomId, index, symbol }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', 'Sala não encontrada!');
            return;
        }

        if (room.gameOver) {
            socket.emit('statusUpdate', `Sala: ${roomId} | Sua vez: Não (jogo terminado)`);
            return;
        }

        if (room.currentPlayer !== symbol || room.playerSymbols[socket.id] !== symbol) {
            socket.emit('statusUpdate', `Sala: ${roomId} | Sua vez: Não (jogada inválida)`);
            return;
        }

        if (room.board[index]) {
            socket.emit('statusUpdate', `Sala: ${roomId} | Sua vez: Não (célula ocupada)`);
            return;
        }

        room.board[index] = symbol;
        const result = checkWinner(room.board);

        if (result.winner || result.isTie) {
            room.gameOver = true;
            io.to(roomId).emit('gameOver', result);
        } else {
            room.currentPlayer = room.currentPlayer === '❌' ? '⭕' : '❌';
        }

        io.to(roomId).emit('gameState', {
            board: room.board,
            currentPlayer: room.currentPlayer,
            gameOver: room.gameOver
        });

        io.to(roomId).emit('statusUpdate', `Sala: ${roomId} | Sua vez: ${room.currentPlayer === room.playerSymbols[socket.id] ? 'Sim' : 'Não'}`);
        console.log(`Jogada na sala ${roomId}: índice ${index}, símbolo ${symbol}`);
    });

    socket.on('resetGame', (roomId) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', 'Sala não encontrada!');
            return;
        }

        room.board = Array(9).fill(null);
        room.currentPlayer = '❌';
        room.gameOver = false;

        io.to(roomId).emit('resetGame', { firstPlayer: '❌' });
        io.to(roomId).emit('gameState', {
            board: room.board,
            currentPlayer: room.currentPlayer,
            gameOver: room.gameOver
        });
        console.log(`Sala ${roomId} reiniciada`);
    });

    socket.on('chatMessage', ({ roomId, message }) => {
        io.to(roomId).emit('chatMessage', message);
        console.log(`Mensagem na sala ${roomId}: ${message}`);
    });

    socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${socket.id}`);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.indexOf(socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                delete room.playerSymbols[socket.id];
                io.to(roomId).emit('error', 'Um jogador desconectou. A sala será fechada.');
                delete rooms[roomId];
                console.log(`Sala ${roomId} fechada devido à desconexão`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
