const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { handleGameEvents } = require("./gameHandlers");
const { RoomManager } = require("./roomManager");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"], // Allow Next.js dev server
    methods: ["GET", "POST"]
  }
});

// Initialize room manager
const roomManager = new RoomManager();

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    rooms: roomManager.getRoomCount(),
    players: roomManager.getTotalPlayers()
  });
});

// Socket connection handling
io.on("connection", (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`);
  
  // Pass room manager to handlers
  handleGameEvents(io, socket, roomManager);

  socket.on("disconnect", () => {
    console.log(`🔌 Player disconnected: ${socket.id}`);
    roomManager.handlePlayerDisconnect(socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ Huzur server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});
