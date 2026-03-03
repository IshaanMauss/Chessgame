const socket = io();
const chess = new Chess();
const boardElement = document.querySelector('.chessboard');

let playerRole = null;
let draggedPiece = null;
let sourceSquare = null;
let pendingPromotionMove = null;

let timers = { w: 600, b: 600 }; 
let activeTimer = null;
let timerInterval = null;
let turnStartTime = Date.now();

let gameMode = 'single'; 
let botDifficulty = 'easy';
let currentRoomId = null; 

// Helper for beautiful status text updates
const statusClasses = "text-xl font-bold text-center min-h-[3.5rem] flex items-center justify-center bg-gray-900/60 rounded-lg p-2 border border-gray-700/50";
function setStatus(msg, colorClass) {
    const el = document.getElementById('gameStatus');
    el.innerText = msg;
    el.className = `${statusClasses} ${colorClass}`;
}

// --- MENU & UI SETUP ---
window.toggleModeUI = function() {
    const mode = document.getElementById('modeSelect').value;
    document.getElementById('difficultyContainer').style.display = mode === 'single' ? 'block' : 'none';
    document.getElementById('joinRoomContainer').style.display = mode === 'join_private' ? 'block' : 'none';
};

window.startGame = function() {
    const theme = document.getElementById('themeSelect').value;
    gameMode = document.getElementById('modeSelect').value;
    botDifficulty = document.getElementById('diffSelect').value;

    document.body.classList.remove('theme-modern', 'theme-traditional');
    document.body.classList.add(`theme-${theme}`);
    document.getElementById('startModal').style.display = 'none';

    document.getElementById('restartBtn').classList.add('hidden'); 
    document.getElementById('undoBtn').classList.add('hidden');

    if (gameMode === 'random') {
        setStatus("Connecting to server...", "text-yellow-400");
        socket.emit('findRandomMatch');
    } else if (gameMode === 'create_private') {
        setStatus("Generating room code...", "text-yellow-400");
        socket.emit('createPrivateRoom');
    } else if (gameMode === 'join_private') {
        const code = document.getElementById('roomCodeInput').value.trim().toLowerCase();
        if (!code) return alert("Please enter a room code!");
        socket.emit('joinPrivateRoom', code);
    } else {
        playerRole = 'w';
        document.getElementById('playerStatus').innerText = 'Playing vs Computer';
        setStatus("Game Started! White's Turn", "text-green-400");
        document.getElementById('restartBtn').classList.remove('hidden'); 
        document.getElementById('undoBtn').classList.remove('hidden'); 
        
        chess.reset();
        timers = { w: 600, b: 600 };
        updateTimersUI();
        renderBoard();
        startTimers('w');
    }
};

window.requestRestart = function() {
    if (gameMode === 'single') {
        chess.reset();
        timers = { w: 600, b: 600 };
        updateTimersUI();
        setStatus("Game Restarted! White's Turn", "text-green-400");
        renderBoard();
        startTimers('w');
    } else {
        alert("Restarts are disabled in Multiplayer matches.");
    }
};

// --- THE UNDO LOGIC ---
window.requestUndo = function() {
    if (gameMode === 'single') {
        if (chess.turn() === 'b') return; // Don't allow undo while computer is thinking
        
        if (chess.history().length >= 2) {
            chess.undo(); // Undo the computer's move
            chess.undo(); // Undo your move
            renderBoard();
            setStatus("White's Turn", "text-green-400");
        }
    } else {
        alert("Undo is only available in 'Vs Computer' mode.");
    }
};

// --- TIMERS & TOASTS ---
function showToast(msg, isPermanent = false) {
    const toast = document.getElementById('toast');
    if(toast) {
        toast.innerText = msg;
        toast.classList.remove('opacity-0');
        if (!isPermanent) setTimeout(() => toast.classList.add('opacity-0'), 3000);
    }
}

function updateTimersUI() {
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };
    document.getElementById('timerW').innerText = formatTime(timers.w);
    document.getElementById('timerB').innerText = formatTime(timers.b);
}

// Smooth Visual Ticking
function startTimers(turn) {
    clearInterval(timerInterval);
    activeTimer = turn;
    turnStartTime = Date.now(); // Anchor point for subtraction

    // This makes the clock drop smoothly every 100ms like offline mode!
    timerInterval = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - turnStartTime) / 1000);
        let timeLeft = timers[activeTimer] - elapsedSeconds;

        if (timeLeft <= 0) {
            timeLeft = 0;
            clearInterval(timerInterval);
            if (gameMode === 'single') triggerGameOver(`Time's up! ${activeTimer === 'w' ? 'Black' : 'White'} wins!`);
        }

        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        if (activeTimer === 'w') document.getElementById('timerW').innerText = `${m}:${s}`;
        else document.getElementById('timerB').innerText = `${m}:${s}`;
    }, 100); 
}

// Server Truth Correction
socket.on('timerSync', (data) => {
    timers = data.timers;
    // Reset the local anchor point so our smooth timer stays perfectly synced with the server
    turnStartTime = Date.now(); 

    // If the browser tab fell asleep and missed the turn change, force correct it!
    if (activeTimer !== data.turn) {
        startTimers(data.turn);
        const turnText = data.turn === 'w' ? "White's Turn" : "Black's Turn";
        const statusEl = document.getElementById('gameStatus');
        if (!statusEl.innerText.includes("wins") && !statusEl.innerText.includes("Draw")) {
            setStatus(turnText, "text-green-400");
        }
    }
});

function triggerGameOver(message) {
    clearInterval(timerInterval);
    setStatus(message, "text-red-500");
    showToast(message, true);
}

// --- HIGHLIGHT LOGIC & RENDERING ---
const clearHighlights = () => document.querySelectorAll('.square').forEach(sq => sq.classList.remove('highlight', 'capture-move'));
boardElement.addEventListener('mousedown', (e) => { if (!e.target.classList.contains('piece')) clearHighlights(); });

const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = "";
    
    if (playerRole === 'b') boardElement.classList.add('flipped');
    else boardElement.classList.remove('flipped');

    board.forEach((row, rowindex) => {
        row.forEach((square, squareindex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add('square', (rowindex + squareindex) % 2 === 0 ? 'light' : 'dark');
            squareElement.dataset.row = rowindex;
            squareElement.dataset.col = squareindex;

            if (square) {
                const pieceElement = document.createElement('div');
                pieceElement.classList.add('piece', square.color === 'w' ? "white" : "black");
                pieceElement.innerText = getPieceUnicode(square) + '\uFE0E';
                
                pieceElement.draggable = (playerRole === square.color && chess.turn() === playerRole);

                pieceElement.addEventListener('mousedown', (e) => {
                    if (pieceElement.draggable) {
                        clearHighlights();
                        const sqNotation = `${String.fromCharCode(97 + squareindex)}${8 - rowindex}`;
                        const moves = chess.moves({ square: sqNotation, verbose: true });
                        moves.forEach(move => {
                            const tCol = move.to.charCodeAt(0) - 97;
                            const tRow = 8 - parseInt(move.to[1]);
                            const targetEl = document.querySelector(`.square[data-row="${tRow}"][data-col="${tCol}"]`);
                            if (targetEl) {
                                targetEl.classList.add('highlight');
                                if (move.flags.includes('c') || move.flags.includes('e')) targetEl.classList.add('capture-move');
                            }
                        });
                    }
                });

                pieceElement.addEventListener('dragstart', (e) => {
                    if (pieceElement.draggable) {
                        draggedPiece = pieceElement;
                        sourceSquare = { row: rowindex, col: squareindex };
                        setTimeout(() => pieceElement.style.opacity = '0.5', 0); 
                    }
                });

                pieceElement.addEventListener("dragend", () => {
                    if (draggedPiece) draggedPiece.style.opacity = '1';
                    draggedPiece = null;
                    sourceSquare = null;
                });

                squareElement.appendChild(pieceElement);
            }

            squareElement.addEventListener("dragover", (e) => e.preventDefault());
            squareElement.addEventListener("drop", (e) => {
                e.preventDefault();
                if (draggedPiece) handleMove(sourceSquare, { row: parseInt(squareElement.dataset.row), col: parseInt(squareElement.dataset.col) });
            });

            boardElement.appendChild(squareElement);
        });
    });
};

const getPieceUnicode = (piece) => {
    const unicodePieces = { p: "♟", r: "♜", n: "♞", b: "♝", q: "♛", k: "♚", P: "♟", R: "♜", N: "♞", B: "♝", Q: "♛", K: "♚" };
    return unicodePieces[piece.color === 'w' ? piece.type.toUpperCase() : piece.type] || "";
};

const handleMove = (source, target) => { 
    const from = `${String.fromCharCode(97 + source.col)}${8 - source.row}`;
    const to = `${String.fromCharCode(97 + target.col)}${8 - target.row}`;

    const piece = chess.get(from);
    if (piece && piece.type === 'p' && (target.row === 0 || target.row === 7)) {
        pendingPromotionMove = { from, to };
        document.getElementById('promotionModal').classList.replace('hidden', 'flex');
        return;
    }
    emitMove({ from, to });
};

window.promotePiece = function(pieceType) {
    if (pendingPromotionMove) {
        emitMove({ ...pendingPromotionMove, promotion: pieceType });
        pendingPromotionMove = null;
        document.getElementById('promotionModal').classList.replace('flex', 'hidden');
    }
};

const emitMove = (move) => {
    const previousTurn = chess.turn(); 
    const validMove = chess.move(move);
    
    if (validMove) {
        clearHighlights();
        
        if (gameMode !== 'single') {
            chess.undo(); 
            socket.emit("move", { roomId: currentRoomId, move: move });
        } else {
            const elapsedSeconds = Math.floor((Date.now() - turnStartTime) / 1000);
            timers[previousTurn] -= elapsedSeconds;
            updateTimersUI();
            
            renderBoard();
            if (chess.in_checkmate()) {
                setStatus("Checkmate! You win!", "text-red-500");
                return showToast("Checkmate! You win!", true);
            }
            if (chess.in_draw() || chess.in_stalemate()) {
                setStatus("Game Over: Draw!", "text-red-500");
                return showToast("Game Over: Draw!", true);
            }
            
            startTimers('b');
            setStatus("Computer is thinking...", "text-gray-400");
            setTimeout(makeBotMove, 1500); 
        }
    } else {
        renderBoard(); 
    }
};

function makeBotMove() {
    if (chess.game_over()) return;

    const moves = chess.moves();
    let moveStr = moves[Math.floor(Math.random() * moves.length)]; 

    if (botDifficulty === 'medium' || botDifficulty === 'hard') {
        let bestScore = -9999;
        moves.forEach(m => {
            chess.move(m);
            let score = evaluateBoard(chess);
            if (botDifficulty === 'hard' && !chess.game_over()) {
                let opponentMoves = chess.moves();
                let worstOpponentScore = 9999;
                opponentMoves.forEach(oppM => {
                    chess.move(oppM);
                    let oppScore = evaluateBoard(chess);
                    if (oppScore < worstOpponentScore) worstOpponentScore = oppScore;
                    chess.undo();
                });
                score = worstOpponentScore; 
            }
            chess.undo();
            if (score > bestScore) { bestScore = score; moveStr = m; }
        });
    }

    chess.move(moveStr);
    
    const elapsedSeconds = Math.floor((Date.now() - turnStartTime) / 1000);
    timers['b'] -= elapsedSeconds;
    updateTimersUI();
    renderBoard();

    if (chess.in_checkmate()) {
        setStatus("Checkmate! Computer wins!", "text-red-500");
        return showToast("Checkmate! Computer wins!", true);
    }
    if (chess.in_draw() || chess.in_stalemate()) {
        setStatus("Game Over: Draw!", "text-red-500");
        return showToast("Game Over: Draw!", true);
    }
    if (chess.in_check()) showToast("You are in Check!");

    startTimers('w');
    setStatus("White's Turn", "text-green-400");
}

function evaluateBoard(gameInstance) {
    let score = 0;
    const values = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };
    const b = gameInstance.board();
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            if (b[i][j]) {
                const val = values[b[i][j].type] || 0;
                score += b[i][j].color === 'b' ? val : -val; 
            }
        }
    }
    return score;
}

// --- SOCKET EVENTS ---
socket.on("playerRole", (role) => {
    playerRole = role;
    document.getElementById('playerStatus').innerText = role === 'w' ? 'Playing as White' : (role === 'b' ? 'Playing as Black' : 'Spectating');
    renderBoard();
});

socket.on('waitingForOpponent', (msg) => {
    document.getElementById('waitingOverlay').classList.remove('hidden');
    document.getElementById('overlayText').innerText = msg;
    document.getElementById('roomCodeDisplay').classList.add('hidden');
});

socket.on('roomCreated', (code) => {
    currentRoomId = code;
    document.getElementById('waitingOverlay').classList.remove('hidden');
    document.getElementById('overlayText').innerText = "Share this code with your friend:";
    document.getElementById('roomCodeDisplay').innerText = code;
    document.getElementById('roomCodeDisplay').classList.remove('hidden');
});

socket.on('invalidRoom', (msg) => {
    alert(msg);
    document.getElementById('startModal').style.display = 'flex'; 
});

socket.on('gameStart', (data) => {
    currentRoomId = data.roomId; 
    document.getElementById('waitingOverlay').classList.add('hidden');
    setStatus(data.msg, "text-green-400");
    timers = { w: 600, b: 600 };
    updateTimersUI();
    startTimers('w');
});

socket.on('boardState', (fen) => {
    chess.load(fen);
    renderBoard();
});

socket.on('switchTurn', (turn) => {
    startTimers(turn); // Instantly switches visual timer side
    setStatus(turn === 'w' ? "White's Turn" : "Black's Turn", "text-green-400");
});

socket.on('inCheck', (turn) => showToast(`${turn === 'w' ? 'White' : 'Black'} is in Check!`));
socket.on('gameOver', (msg) => triggerGameOver(msg));
socket.on('invalidMove', () => renderBoard());

renderBoard();