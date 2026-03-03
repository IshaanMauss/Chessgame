# ♟️ Global Multiplayer Chess

A full-stack, real-time multiplayer chess application built with Node.js and WebSockets. This project features global matchmaking, private rooms, server-side timer synchronization, and a custom-built AI engine for offline play.

**[🎮 Play the Live Demo Here]([YOUR_RENDER_URL_HERE])**

## ✨ Key Features

* **🌍 Global Matchmaking:** Instantly pair up with a random opponent online via a matchmaking queue.
* **🔒 Private Rooms:** Generate a secure, unique 6-character room code to play private matches with friends.
* **🤖 Custom AI Engine (Vs Computer):** Play offline against a built-in bot. Includes 3 difficulties, featuring a custom implementation of the **Minimax Algorithm** to simulate intelligent decision-making.
* **⏱️ Server-Authoritative Timers:** Solves the notorious "browser background-tab throttling" issue. The Node.js server acts as the master clock, tracking real-world time elapsed and broadcasting truth to all clients.
* **🎨 Dynamic Theming & UI:** Toggle instantly between "Modern Glassmorphism" and "Traditional Wood" aesthetics.
* **↩️ Move Management:** Features drag-and-drop mechanics, legal-move highlighting, pawn promotion modals, and an Undo function for offline play.

## 🛠️ Tech Stack

* **Frontend:** HTML, JavaScript, Tailwind CSS
* **Backend:** Node.js, Express.js
* **Real-Time Communication:** Socket.io
* **Game Logic:** Chess.js (Move validation, state parsing)
* **Deployment:** Render (Cloud Web Service)

## 🧠 System Architecture & Highlights

* **State Management:** The server maintains an active dictionary of `activeGames`, keeping track of dozens of isolated `Chess()` instances, precise timestamps, and Socket.io room groupings simultaneously.
* **WebSocket Optimization:** Moves and time-sync data are explicitly broadcasted *only* to specific Socket rooms using `io.to(roomId).emit()`, drastically reducing unnecessary server load and bandwidth.
* **Master Clock Sync:** To combat aggressive browser memory-saving features (which pause JavaScript intervals when tabs are minimized), the server calculates `Date.now()` deltas and forcibly syncs the true clock and turn-state to the client every 1000ms.

## 🚀 Run it Locally

To run this project on your local machine:

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/YOUR_GITHUB_USERNAME/Chessgame.git](https://github.com/YOUR_GITHUB_USERNAME/Chessgame.git)
   cd Chessgame
