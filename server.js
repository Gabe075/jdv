// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*', // Permite conexões de qualquer origem (ajuste em produção)
        methods: ['GET', 'POST']
    }
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    socket.on('createRoom', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [socket.id], board: Array(9).fill(null), currentPlayer: '❌' };
            socket.join(roomId);
            socket.emit('roomCreated', roomId);
        } else {
            socket.emit('error', 'Sala já existe');
        }
    });

    socket.on('joinRoom', (roomId) => {
        if (rooms[roomId] && rooms[roomId].players.length < 2) {
            rooms[roomId].players.push(socket.id);
            socket.join(roomId);
            io.to(roomId).emit('playerJoined');
            io.to(roomId).emit('gameState', {
                board: rooms[roomId].board,
                currentPlayer: rooms[roomId].currentPlayer,
                gameOver: false
            });
        } else {
            socket.emit('error', 'Sala cheia ou inexistente');
        }
    });

    socket.on('makeMove', ({ roomId, index, symbol }) => {
        if (rooms[roomId] && !rooms[roomId].board[index]) {
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
            rooms[roomId].currentPlayer = rooms[roomId].currentPlayer === '❌' ? '⭕' : '❌';
            io.to(roomId).emit('gameState', {
                board: rooms[roomId].board,
                currentPlayer: rooms[roomId].currentPlayer,
                gameOver: winner || isTie
            });
            if (winner || isTie) {
                io.to(roomId).emit('gameOver', { winner, isTie });
            }
        }
    });

    socket.on('resetGame', (roomId) => {
        if (rooms[roomId]) {
            rooms[roomId].board = Array(9).fill(null);
            rooms[roomId].currentPlayer = '❌';
            io.to(roomId).emit('resetGame');
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
