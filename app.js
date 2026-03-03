const express = require('express');
const socket = require('socket.io');
const http = require('http');
const { Chess } = require("chess.js");
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socket(server);

const activeGames = {}; 
let waitingPlayer = null; 

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index', { title: 'Global Multiplayer Chess' });
});

const generateRoomId = () => crypto.randomBytes(3).toString('hex');

io.on("connection", (socket) => {
    console.log('Player connected:', socket.id);

    // --- 1. RANDOM MATCHMAKING ---
    socket.on('findRandomMatch', () => {
        // Double check that the waiting player didn't disconnect right before we matched them
        const waitingSocket = waitingPlayer ? io.sockets.sockets.get(waitingPlayer) : null;

        if (waitingPlayer && waitingPlayer !== socket.id && waitingSocket) {
            const roomId = generateRoomId();
            activeGames[roomId] = {
                chess: new Chess(),
                white: waitingPlayer,
                black: socket.id,
                started: true,
                timers: { w: 600, b: 600 },
                lastMoveTime: Date.now()
            };

            waitingSocket.join(roomId);
            socket.join(roomId);

            io.to(waitingPlayer).emit('playerRole', 'w');
            io.to(socket.id).emit('playerRole', 'b');
            
            io.to(roomId).emit('gameStart', { roomId, msg: "Opponent found! White's turn." });
            io.to(roomId).emit('boardState', activeGames[roomId].chess.fen());
            
            waitingPlayer = null; 
        } else {
            waitingPlayer = socket.id;
            socket.emit('waitingForOpponent', "Searching for a random opponent...");
        }
    });

    // --- 2. CREATE PRIVATE ROOM ---
    socket.on('createPrivateRoom', () => {
        const roomId = generateRoomId();
        activeGames[roomId] = {
            chess: new Chess(),
            white: socket.id,
            black: null,
            started: false,
            timers: { w: 600, b: 600 },
            lastMoveTime: null
        };
        socket.join(roomId);
        socket.emit('playerRole', 'w');
        socket.emit('roomCreated', roomId); 
    });

    // --- 3. JOIN PRIVATE ROOM ---
    socket.on('joinPrivateRoom', (roomId) => {
        const game = activeGames[roomId];
        if (!game) return socket.emit('invalidRoom', 'Room does not exist.');
        if (game.white && game.black) return socket.emit('invalidRoom', 'Room is full.');

        game.black = socket.id;
        game.started = true;
        game.lastMoveTime = Date.now();
        socket.join(roomId);

        socket.emit('playerRole', 'b');
        io.to(roomId).emit('gameStart', { roomId, msg: "Friend joined! White's turn." });
        io.to(roomId).emit('boardState', game.chess.fen());
    });

    // --- 4. HANDLE MOVES ---
    socket.on('move', ({ roomId, move }) => {
        const game = activeGames[roomId];
        if (!game || !game.started) return;

        try {
            if (game.chess.turn() === 'w' && socket.id !== game.white) return;
            if (game.chess.turn() === 'b' && socket.id !== game.black) return;

            const previousTurn = game.chess.turn();
            const result = game.chess.move(move);
            
            if (result) {
                // Deduct exact real-world time passed
                const now = Date.now();
                const elapsedSeconds = Math.floor((now - game.lastMoveTime) / 1000);
                game.timers[previousTurn] -= elapsedSeconds;
                if (game.timers[previousTurn] < 0) game.timers[previousTurn] = 0;
                game.lastMoveTime = now;

                io.to(roomId).emit('boardState', game.chess.fen());

                // Check game over conditions
                if (game.chess.in_checkmate()) {
                    game.started = false; 
                    io.to(roomId).emit('gameOver', `Checkmate! ${game.chess.turn() === 'w' ? 'Black' : 'White'} wins!`);
                } else if (game.chess.in_draw() || game.chess.in_stalemate() || game.chess.in_threefold_repetition()) {
                    game.started = false; 
                    io.to(roomId).emit('gameOver', 'Game Over: Draw!');
                } else {
                    io.to(roomId).emit('switchTurn', game.chess.turn());
                    if (game.chess.in_check()) io.to(roomId).emit('inCheck', game.chess.turn());
                }
            } else {
                socket.emit("invalidMove");
            }
        } catch (err) {
            socket.emit("invalidMove");
        }
    });

    // --- 5. HANDLE DISCONNECTS ---
    socket.on('disconnect', () => {
        console.log("Player disconnected:", socket.id);
        
        // Remove from matchmaking queue if they leave
        if (waitingPlayer === socket.id) waitingPlayer = null;

        // End any active games they were a part of
        for (const roomId in activeGames) {
            const game = activeGames[roomId];
            if (game.white === socket.id || game.black === socket.id) {
                const winner = game.white === socket.id ? 'Black' : 'White';
                
                // If the game started, someone wins. If it hadn't started, the room just closes.
                if (game.started) {
                    io.to(roomId).emit('gameOver', `Opponent disconnected. ${winner} wins!`);
                }
                
                delete activeGames[roomId]; 
                break;
            }
        }
    });
});

// --- 6. MASTER CLOCK: Broadcasts time AND turn state every second ---
setInterval(() => {
    const now = Date.now();
    for (const roomId in activeGames) {
        const game = activeGames[roomId];
        
        if (game && game.started) {
            const elapsedSeconds = Math.floor((now - game.lastMoveTime) / 1000);
            const activeTurn = game.chess.turn();
            const currentActiveTime = game.timers[activeTurn] - elapsedSeconds;

            if (currentActiveTime <= 0) {
                game.started = false; 
                io.to(roomId).emit('timerSync', {
                    timers: { w: activeTurn === 'w' ? 0 : game.timers.w, b: activeTurn === 'b' ? 0 : game.timers.b },
                    turn: activeTurn
                });
                const winner = activeTurn === 'w' ? 'Black' : 'White';
                io.to(roomId).emit('gameOver', `Time's up! ${winner} wins!`);
            } else {
                io.to(roomId).emit('timerSync', {
                    timers: { w: activeTurn === 'w' ? currentActiveTime : game.timers.w, b: activeTurn === 'b' ? currentActiveTime : game.timers.b },
                    turn: activeTurn 
                });
            }
        }
    }
}, 1000);

// Use process.env.PORT for deployment (Render/Railway), fallback to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Global Chess Server running on port ${PORT}`);
});