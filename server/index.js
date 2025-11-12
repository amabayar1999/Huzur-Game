const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { handleGameEvents, rooms } = require("./gameHandlers");
const { PerformanceMonitor } = require("./performanceMonitor");
const { GameDatabase } = require("./database");
const { GameState } = require("./gameState");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: [
      "http://localhost:3000", 
      "http://127.0.0.1:3000",
      "http://localhost:3006", 
      "http://127.0.0.1:3006",
      "http://10.56.81.235:3000",  // Phone access - Next.js app
      "http://10.56.81.235:4000"   // Phone access - Socket.IO server
    ],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['polling', 'websocket'], // Start with polling, then upgrade to websocket
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6,
  allowUpgrades: true
});

// Initialize performance monitor and database
const performanceMonitor = new PerformanceMonitor();
const gameDB = new GameDatabase();

// Room recovery function
async function recoverRoomsFromDatabase() {
  try {
    console.log('🔄 Recovering rooms from database...');
    
    // Get all active games from database
    const activeGames = await gameDB.getAllActiveGames();
    
    for (const game of activeGames) {
      try {
        // Recreate GameState from stored data
        const gameState = new GameState(game.room_id);
        
        // Restore game state
        const storedState = JSON.parse(game.game_state);
        
        // Restore basic properties
        gameState.roomId = storedState.roomId;
        gameState.roomOwner = storedState.roomOwner;
        gameState.started = storedState.started;
        gameState.currentPlayer = storedState.currentPlayer;
        gameState.leadPlayer = storedState.leadPlayer;
        gameState.leadCard = storedState.leadCard;
        gameState.pile = storedState.pile || [];
        gameState.deck = storedState.deck || [];
        gameState.trumpSuit = storedState.trumpSuit;
        gameState.trumpCard = storedState.trumpCard;
        gameState.trumpCardDrawn = storedState.trumpCardDrawn || false;
        gameState.playerHands = storedState.playerHands || {};
        gameState.deadPile = storedState.deadPile || [];
        gameState.winner = storedState.winner;
        gameState.log = storedState.log || [];
        gameState.lastPlay = storedState.lastPlay || {};
        gameState.createdAt = new Date(storedState.createdAt);
        
        // Restore players
        gameState.players = storedState.players ? storedState.players.map(p => p.id) : [];
        
        // Restore game statistics
        if (storedState.gameStats) {
          gameState.gameStats = storedState.gameStats;
        }
        
        // Add to in-memory rooms
        rooms[game.room_id] = gameState;
        
        console.log(`✅ Recovered room ${game.room_id} with ${gameState.players.length} players`);
      } catch (error) {
        console.error(`❌ Failed to recover room ${game.room_id}:`, error.message);
      }
    }
    
    console.log(`🎯 Room recovery complete: ${Object.keys(rooms).length} rooms restored`);
  } catch (error) {
    console.error('❌ Room recovery failed:', error);
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  const healthStatus = performanceMonitor.getHealthStatus();
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    message: "Clean multiplayer server running",
    architecture: "server-authoritative",
    health: healthStatus
  });
});

// Metrics endpoint
app.get("/metrics", (req, res) => {
  res.json(performanceMonitor.getMetrics());
});

// List rooms endpoint for debugging
app.get("/api/rooms", (req, res) => {
  const roomList = Object.keys(rooms).map(roomId => ({
    roomId,
    playerCount: rooms[roomId] ? rooms[roomId].getState().players.length : 0,
    gameStarted: rooms[roomId] ? rooms[roomId].getState().gameStarted : false
  }));
  res.json({ rooms: roomList });
});

// Performance history endpoint
app.get("/api/performance", (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json({
    history: performanceMonitor.getPerformanceHistory(limit),
    errors: performanceMonitor.getErrorHistory(50),
    connections: performanceMonitor.getConnectionHistory(100)
  });
});

// Socket connection handling
io.on("connection", (socket) => {
  console.log(`🔌 Player connected: ${socket.id}`);
  
  // Track connection
  performanceMonitor.trackConnection(socket.id, 'connect');
  
  // Handle all game events using clean architecture
  handleGameEvents(io, socket);

  socket.on("disconnect", () => {
    console.log(`🔌 Player disconnected: ${socket.id}`);
    performanceMonitor.trackConnection(socket.id, 'disconnect');
  });
});

const PORT = process.env.PORT || 4000;

// Start server with room recovery
async function startServer() {
  try {
    // Recover rooms from database first
    await recoverRoomsFromDatabase();
    
    // Start background cleanup once
    (function startBackgroundCleanup() {
      setInterval(async () => {
        // 1) Purge old DB games by updated_at (10 minutes)
        try {
          const purged = await gameDB.deleteOldGames(10);
          if (purged > 0) {
            console.log(`🧹 Purged ${purged} old game(s) from DB (>=10 min inactive)`);
          }
        } catch (e) {
          console.error('DB purge failed:', e);
        }

        // 2) Remove in-memory rooms that are empty and older than 10 minutes
        try {
          const now = Date.now();
          for (const [roomId, gameState] of Object.entries(rooms)) {
            const isEmpty = gameState.players.length === 0;
            const tooOld = now - new Date(gameState.createdAt).getTime() > 10 * 60 * 1000;
            if (isEmpty && tooOld) {
              delete rooms[roomId];
              performanceMonitor.trackRoomDeleted(roomId);
              try { await gameDB.archiveGame(roomId); } catch {}
              console.log(`🧹 Pruned empty in-memory room: ${roomId}`);
            }
          }
        } catch (e) {
          console.error('In-memory prune failed:', e);
        }
      }, 60 * 1000);
    })();

    // Start the server on all network interfaces
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Clean Huzur server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
      console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
      console.log(`🎯 Architecture: Server-authoritative, single source of truth`);
      console.log(`🚀 Ready for production multiplayer games!`);
      console.log(`📱 Network access: Server listening on all interfaces (0.0.0.0:${PORT})`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();