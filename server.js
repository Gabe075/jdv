const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const rooms = {};

io.on('connection', (socket) => {
    socket.on('createRoom', (roomId) => {
        if (!rooms[roomId]) {
            const firstPlayer = '❌'; // Criador da sala sempre começa
            const playerSymbol = firstPlayer;
            const aiSymbol = playerSymbol === '❌' ? '⭕' : '❌';
            rooms[roomId] = { 
                players: [socket.id], 
                board: Array(9).fill(null), 
                currentPlayer: firstPlayer,
                symbols: { [socket.id]: playerSymbol }
            };
            socket.join(roomId);
            socket.emit('roomCreated', { playerSymbol, aiSymbol, firstPlayer });
            socket.emit('gameState', {
                board: rooms[roomId].board,
                currentPlayer: firstPlayer,
                gameOver: false
            });
            socket.emit('statusUpdate', `Sala: ${roomId} | Sua vez: Sim`);
        } else {
            socket.emit('error', 'Sala já existe');
        }
    });

    socket.on('joinRoom', (roomId) => {
        if (rooms[roomId] && rooms[roomId].players.length < 2) {
            const creatorSymbol = rooms[roomId].symbols[rooms[roomId].players[0]];
            const playerSymbol = creatorSymbol === '❌' ? '⭕' : '❌';
            const aiSymbol = creatorSymbol;
            rooms[roomId].players.push(socket.id);
            rooms[roomId].symbols[socket.id] = playerSymbol;
            socket.join(roomId);
            const firstPlayer = rooms[roomId].currentPlayer; // Criador da sala começa
            io.to(roomId).emit('playerJoined', { playerSymbol, aiSymbol, firstPlayer });
            io.to(roomId).emit('gameState', {
                board: rooms[roomId].board,
                currentPlayer: firstPlayer,
                gameOver: false
            });
            // Atualiza status para ambos
            rooms[roomId].players.forEach(playerId => {
                const isMyTurn = rooms[roomId].currentPlayer === rooms[roomId].symbols[playerId];
                io.to(playerId).emit('statusUpdate', `Sala: ${roomId} | Sua vez: ${isMyTurn ? 'Sim' : 'Não'}`);
            });
        } else {
            socket.emit('error', 'Sala cheia ou inexistente');
        }
    });

    socket.on('makeMove', ({ roomId, index, symbol }) => {
        if (rooms[roomId] && !rooms[roomId].board[index] && rooms[roomId].currentPlayer === symbol) {
            rooms[roomId].board[index] = symbol;
            const winPatterns = [
                [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]
            ];
            let winner = null;
            for (const pattern of winPatterns) {
                const [a, b, c] = pattern;
                if (rooms[roomId].board[a] && rooms[roomId].board[a] === rooms[roomId].board[b] && rooms[roomId].board[a] === rooms[roomId].board[c]) {
                    winner = rooms[roomId].board[a];
                    break;
                }
            }
            const isTie = rooms[roomId].board.every(cell => cell) && !winner;
            if (!winner && !isTie) {
                rooms[roomId].currentPlayer = rooms[roomId].currentPlayer === '❌' ? '⭕' : '❌';
            }
            io.to(roomId).emit('gameState', {
                board: rooms[roomId].board,
                currentPlayer: rooms[roomId].currentPlayer,
                gameOver: winner || isTie
            });
            // Atualiza status para todos
            rooms[roomId].players.forEach(playerId => {
                const isMyTurn = rooms[roomId].currentPlayer === rooms[roomId].symbols[playerId];
                io.to(playerId).emit('statusUpdate', `Sala: ${roomId} | Sua vez: ${isMyTurn ? 'Sim' : 'Não'}`);
            });
            if (winner || isTie) {
                io.to(roomId).emit('gameOver', { winner, isTie });
            }
        }
    });

    socket.on('chatMessage', ({ roomId, message }) => {
        if (rooms[roomId]) {
            io.to(roomId).emit('chatMessage', message);
        }
    });

    socket.on('resetGame', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].board = Array(9).fill(null);
            const firstPlayer = '❌'; // Criador da sala começa
            rooms[roomId].currentPlayer = firstPlayer;
            io.to(roomId).emit('resetGame', { firstPlayer });
            io.to(roomId).emit('gameState', {
                board: rooms[roomId].board,
                currentPlayer: firstPlayer,
                gameOver: false
            });
            // Atualiza status após reset
            rooms[roomId].players.forEach(playerId => {
                const isMyTurn = firstPlayer === rooms[roomId].symbols[playerId];
                io.to(playerId).emit('statusUpdate', `Sala: ${roomId} | Sua vez: ${isMyTurn ? 'Sim' : 'Não'}`);
            });
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            if (rooms[roomId].players.includes(socket.id)) {
                rooms[roomId].players = rooms[roomId].players.filter(id => id !== socket.id);
                if (rooms[roomId].players.length === 0) {
                    delete rooms[roomId];
                } else {
                    io.to(roomId).emit('error', 'Um jogador desconectou');
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
