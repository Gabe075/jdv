const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*', // Ajuste para o domínio do seu cliente, ex.: "http://localhost" ou "https://seu-site.com"
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
            console.log(`Sala criada: ${roomId}`);
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
            console.log(`Jogador entrou na sala: ${roomId}`);
        } else {
            socket.emit('error', 'Sala cheia ou inexistente');
        }
    });

    socket.on('makeMove', ({ roomId, index, symbol }) => {
        if (rooms[roomId] && !rooms[roomId].board[index]) {
            rooms[roomId].board[index] = symbol;
            const result = checkWinner(rooms[roomId].board);
            rooms[roomId].currentPlayer = rooms[roomId].currentPlayer === '❌' ? '⭕' : '❌';
            io.to(roomId).emit('gameState', {
                board: rooms[roomId].board,
                currentPlayer: rooms[roomId].currentPlayer,
                gameOver: result.winner || result.isTie
            });
            if (result.winner || result.isTie) {
                io.to(roomId).emit('gameOver', result);
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
            const room = rooms[roomId];
            if (room.players.includes(socket.id)) {
                room.players = room.players.filter(id => id !== socket.id);
                if (room.players.length === 0) {
                    delete rooms[roomId];
                } else {
                    io.to(roomId).emit('error', 'Um jogador desconectou');
                }
            }
        }
        console.log('Cliente desconectado:', socket.id);
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
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
