// Clean Socket.io Event Handlers - Production Grade Architecture with Database
const { GameState } = require('./gameState');
const { GameDatabase } = require('./database');
const { PerformanceMonitor } = require('./performanceMonitor');

// Initialize database and performance monitor
const gameDB = new GameDatabase();
const performanceMonitor = new PerformanceMonitor();

// In-memory room storage - single source of truth
const rooms = {};

// Socket ID to Player ID mapping for stable player identification
const socketToPlayerMap = {};

// Helper function to get effective player ID from socket
function getEffectivePlayerId(socket) {
  return socketToPlayerMap[socket.id] || socket.id;
}

function handleGameEvents(io, socket) {
  
  // 1️⃣ CREATE ROOM
  socket.on("create_room", async (data, ack) => {
    const roomId = data.roomId || Math.random().toString(36).substr(2, 6);
    
    // Check if room already exists
    if (rooms[roomId]) {
      const fail = { ok: false, error: { message: "Room already exists" } };
      ack?.(fail);
      return;
    }
    
    try {
      // Create new game state
      const gameState = new GameState(roomId);
      // ✅ FIX: Use playerId from client if provided, otherwise fallback to socket.id
      const effectivePlayerId = data.playerId || socket.id;
      socketToPlayerMap[socket.id] = effectivePlayerId;
      gameState.addPlayer(effectivePlayerId);
      rooms[roomId] = gameState;
      
      // Save to database
      await gameDB.saveGameState(roomId, gameState.getState());
      await gameDB.addPlayer(roomId, effectivePlayerId);
      await gameDB.logAction(roomId, effectivePlayerId, 'room_created');
      
      // Track performance
      performanceMonitor.trackRoomCreated(roomId);
      
      // Join socket room
      socket.join(roomId);
      
      // Send success response
      socket.emit("room_created", { 
        roomId, 
        gameState: gameState.getState() 
      });
      
      // Send ACK response
      ack?.({ ok: true, data: { roomId, gameState: gameState.getState() } });
      
      console.log(`🏠 Room ${roomId} created by ${socket.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
      performanceMonitor.trackError(error, { action: 'create_room', roomId });
      const fail = { ok: false, error: { message: "Failed to create room" } };
      ack?.(fail);
    }
  });

  // 2️⃣ JOIN ROOM
  socket.on("join_room", async (data, ack) => {
    const { roomId, playerId } = data; // <— make sure client sends a stable playerId
    console.log(`🎮 Player ${socket.id} (pid:${playerId}) attempting to join room: ${roomId}`);
    console.log(`📋 Available rooms:`, Object.keys(rooms));

    const room = rooms[roomId];
    if (!room) {
      console.log(`❌ Room ${roomId} not found`);
      const fail = { ok: false, error: { message: "Room not found" } };
      ack?.(fail);
      // Also emit specific error event for better client handling
      socket.emit('join_room_error', { message: "Room not found", roomId });
      return;
    }

    const gameState = room;

    // ✅ Check if the game is already started
    const effectivePlayerId = playerId || socket.id;
    if (gameState.started && !gameState.hasPlayer(effectivePlayerId)) {
      console.log(`🚫 Game in room ${roomId} already started. Blocking new join.`);
      const fail = { ok: false, error: { message: "Game already started" } };
      ack?.(fail);
      return;
    }

    try {
      // Store socket to player mapping
      socketToPlayerMap[socket.id] = effectivePlayerId;
      
    // ✅ Rejoining logic - check by playerId first, then socket.id
    if (gameState.hasPlayer(effectivePlayerId)) {
      console.log(`♻️ Player rejoining existing game: ${effectivePlayerId}`);
      socket.join(roomId);
      
      // Update socket mapping for reconnection
      socketToPlayerMap[socket.id] = effectivePlayerId;
      
      const payload = {
        roomId,
        gameState: gameState.getState(),
      };
      socket.emit("room_rejoined", payload);
      ack?.({ ok: true, data: payload });
      
      // Broadcast player reconnection to other players
      io.to(roomId).emit("player_reconnected", gameState.getState());
      return;
    }

      // ✅ New player joining (game not started)
      gameState.addPlayer(effectivePlayerId);
      socket.join(roomId);

      await gameDB.saveGameState(roomId, gameState.getState());
      await gameDB.addPlayer(roomId, effectivePlayerId);
      await gameDB.logAction(roomId, effectivePlayerId, "player_joined");

      // Send current state to the joining player
      const payload = {
        roomId,
        gameState: gameState.getState(),
      };
      socket.emit("room_joined", payload);
      ack?.({ ok: true, data: payload });

      // Broadcast updated player list to everyone in the room
      io.to(roomId).emit("player_joined", gameState.getState());

      console.log(`👤 ${effectivePlayerId} joined room ${roomId}`);
    } catch (error) {
      console.error("Error joining room:", error);
      performanceMonitor.trackError(error, { action: "join_room", roomId });
      const fail = { ok: false, error: { message: "Failed to join room" } };
      ack?.(fail);
    }
  });

  // 3️⃣ LEAVE ROOM
  socket.on("leave_room", async () => {
    try {
      const effectivePlayerId = getEffectivePlayerId(socket);
      
      // Find room for this player
      const roomId = Object.keys(rooms).find(id => 
        rooms[id].players.includes(effectivePlayerId)
      );
      
      if (!roomId) {
        socket.emit("server_error", { message: "Not in any room" });
        return;
      }
      
      const gameState = rooms[roomId];
      gameState.removePlayer(effectivePlayerId);
      socket.leave(roomId);
      
      // Clean up socket mapping
      delete socketToPlayerMap[socket.id];
      
      // Save to database
      await gameDB.saveGameState(roomId, gameState.getState());
      await gameDB.removePlayer(roomId, effectivePlayerId);
      await gameDB.logAction(roomId, effectivePlayerId, 'player_left');
      
      // If no players left, delete room
      if (gameState.players.length === 0) {
        delete rooms[roomId];
        performanceMonitor.trackRoomDeleted(roomId);
      } else {
        // Broadcast updated state to remaining players
        io.to(roomId).emit("player_left", gameState.getState());
      }
      
      socket.emit("room_left", { roomId });
      console.log(`👤 ${socket.id} left room ${roomId}`);
    } catch (error) {
      console.error('Error leaving room:', error);
      performanceMonitor.trackError(error, { action: 'leave_room' });
      socket.emit("server_error", { message: "Failed to leave room" });
    }
  });

  // 4️⃣ START GAME
  socket.on("start_game", async (data, ack) => {
    const { playerId } = data;
    const effectivePlayerId = playerId || socket.id;
    console.log("⚙️ start_game handler triggered by:", socket.id, "playerId:", playerId, "effectivePlayerId:", effectivePlayerId);
    console.log("ACK function available?", !!ack);
    
    // Debug: Log socket to player mapping
    console.log("🔍 Socket to player mapping:", socketToPlayerMap);
    
    try {
      const roomId = Object.keys(rooms).find((id) =>
        rooms[id].hasPlayer(effectivePlayerId)
      );
      
      console.log("⚙️ start_game requested for", roomId);
      
      if (!roomId) {
        console.log("❌ No room found for player:", effectivePlayerId);
        const fail = { ok: false, error: { message: "Not in any room" } };
        ack?.(fail);
        return;
      }

      const room = rooms[roomId];
      const gameState = room;
      
      // Debug: Log game state details
      console.log("🔍 Game state debug:", {
        roomId,
        players: gameState.players,
        roomOwner: gameState.roomOwner,
        started: gameState.started,
        canStart: !gameState.started && gameState.players.length >= 2,
        effectivePlayerId,
        isRoomOwner: gameState.roomOwner === effectivePlayerId
      });

      // ✅ Idempotent: if already started, just ACK success
      if (gameState.started) {
        console.log("⚠️ Game already started in", roomId, "– returning OK");
        const payload = { roomId, gameState: gameState.getState() };
        ack?.({ ok: true, data: payload }); // ✅ ACK first
        socket.emit("game_started", payload); // resend event just in case client missed it
        return;
      }

      // ✅ Check if player is room owner
      if (gameState.roomOwner !== effectivePlayerId) {
        console.log("❌ Player is not room owner:", effectivePlayerId, "roomOwner:", gameState.roomOwner);
        const fail = { ok: false, error: { message: "Only the room owner can start the game", code: 'NOT_ROOM_OWNER' } };
        ack?.(fail);
        return;
      }

      const result = gameState.startGame();
      if (!result.success) {
        console.log("❌ startGame() failed:", result.error);
        const fail = { ok: false, error: { message: result.error, code: 'GAME_START_FAILED' } };
        ack?.(fail); // ✅ ACK immediately on failure
        return;
      }

      // ✅ Game successfully started - ACK before async operations
      const payload = { roomId, gameState: gameState.getState() };
      ack?.({ ok: true, data: payload }); // ✅ ACK first to prevent timeout
      
      // Then do async operations
      await gameDB.saveGameState(roomId, gameState.getState());
      await gameDB.logAction(roomId, socket.id, "game_started");
      performanceMonitor.trackGameStarted(roomId, gameState.players.length);

      io.to(roomId).emit("game_started", payload);
      console.log(`🎮 Game started in room ${roomId}`);
    } catch (error) {
      console.error("💥 start_game error:", error);
      performanceMonitor.trackError(error, { action: "start_game" });
      const fail = { ok: false, error: { message: "Failed to start game" } };
      ack?.(fail);
    }
  });

  // 5️⃣ PLAY CARD
  socket.on("play_card", async (data) => {
    const { card } = data;
    
    try {
      const effectivePlayerId = getEffectivePlayerId(socket);
      
      // Find room for this player
      const roomId = Object.keys(rooms).find(id => 
        rooms[id].players.includes(effectivePlayerId)
      );
      
      if (!roomId) {
        socket.emit("server_error", { message: "Not in any room" });
        return;
      }
      
      const gameState = rooms[roomId];
      const result = gameState.playCard(effectivePlayerId, card);
      
      if (result.success) {
        // Save to database
        await gameDB.saveGameState(roomId, gameState.getState());
        await gameDB.logAction(roomId, effectivePlayerId, 'card_played', { card });
        
        // Track performance
        const cardType = Array.isArray(card) ? 'combo' : 'single';
        performanceMonitor.trackCardPlayed(roomId, effectivePlayerId, cardType);
        
        // Broadcast updated state to all players
        io.to(roomId).emit("update_state", gameState.getState());
        console.log(`🃏 ${effectivePlayerId} played card in room ${roomId}`);
      } else {
        socket.emit("server_error", { message: result.error });
      }
    } catch (error) {
      console.error('Error playing card:', error);
      performanceMonitor.trackError(error, { action: 'play_card', card });
      socket.emit("server_error", { message: "Failed to play card" });
    }
  });

  // 6️⃣ PICK UP PILE
  socket.on("pickup_pile", async () => {
    try {
      const effectivePlayerId = getEffectivePlayerId(socket);
      
      // Find room for this player
      const roomId = Object.keys(rooms).find(id => 
        rooms[id].players.includes(effectivePlayerId)
      );
      
      if (!roomId) {
        socket.emit("server_error", { message: "Not in any room" });
        return;
      }
      
      const gameState = rooms[roomId];
      const result = gameState.pickupPile(effectivePlayerId);
      
      if (result.success) {
        // Save to database
        await gameDB.saveGameState(roomId, gameState.getState());
        await gameDB.logAction(roomId, effectivePlayerId, 'pile_picked_up');
        
        // Broadcast updated state to all players
        io.to(roomId).emit("update_state", gameState.getState());
        console.log(`📥 ${effectivePlayerId} picked up pile in room ${roomId}`);
      } else {
        socket.emit("server_error", { message: result.error });
      }
    } catch (error) {
      console.error('Error picking up pile:', error);
      performanceMonitor.trackError(error, { action: 'pickup_pile' });
      socket.emit("server_error", { message: "Failed to pickup pile" });
    }
  });

  // 7️⃣ GET ROOM STATE
  socket.on("get_room_state", () => {
    try {
      const effectivePlayerId = getEffectivePlayerId(socket);
      
      // Find room for this player
      const roomId = Object.keys(rooms).find(id => 
        rooms[id].players.includes(effectivePlayerId)
      );
      
      if (!roomId) {
        socket.emit("server_error", { message: "Not in any room" });
        return;
      }
      
      const gameState = rooms[roomId];
      socket.emit("room_state", gameState.getState());
    } catch (error) {
      console.error('Error getting room state:', error);
      performanceMonitor.trackError(error, { action: 'get_room_state' });
      socket.emit("server_error", { message: "Failed to get room state" });
    }
  });

  // 8️⃣ GET AVAILABLE ROOMS
  socket.on("get_rooms", () => {
    try {
      const availableRooms = Object.keys(rooms).map(roomId => ({
        roomId,
        playerCount: rooms[roomId].players.length,
        gameStarted: rooms[roomId].started
      }));
      
      socket.emit("rooms_list", { rooms: availableRooms });
    } catch (error) {
      console.error('Error getting rooms:', error);
      performanceMonitor.trackError(error, { action: 'get_rooms' });
      socket.emit("server_error", { message: "Failed to get rooms" });
    }
  });

  // 9️⃣ SYNC STATE (Refresh current room state)
  socket.on("sync_state", async (data, ack) => {
    try {
      const effectivePlayerId = getEffectivePlayerId(socket);
      
      // Find room for this player
      const roomId = Object.keys(rooms).find(id => 
        rooms[id].players.includes(effectivePlayerId)
      );
      
      if (!roomId) {
        const fail = { ok: false, error: { message: "Not in any room" } };
        ack?.(fail);
        return;
      }
      
      const gameState = rooms[roomId];
      
      // Get fresh state from database as backup
      const dbState = await gameDB.loadGameState(roomId);
      
      // Use in-memory state if available, otherwise database state
      const currentState = gameState ? gameState.getState() : dbState;
      
      if (!currentState) {
        const fail = { ok: false, error: { message: "Room state not found" } };
        ack?.(fail);
        return;
      }
      
      // Send fresh state to client
      socket.emit("state_synced", currentState);
      
      // Send ACK response
      ack?.({ ok: true, data: currentState });
      
      console.log(`🔄 State synced for ${effectivePlayerId} in room ${roomId}`);
    } catch (error) {
      console.error('Error syncing state:', error);
      performanceMonitor.trackError(error, { action: 'sync_state' });
      const fail = { ok: false, error: { message: "Failed to sync state" } };
      ack?.(fail);
    }
  });

  // 9️⃣ DISCONNECT HANDLER
  socket.on("disconnect", async () => {
    try {
      const effectivePlayerId = getEffectivePlayerId(socket);
      
      // Find and remove player from all rooms
      Object.keys(rooms).forEach(async (roomId) => {
        const gameState = rooms[roomId];
        if (gameState.players.includes(effectivePlayerId)) {
          gameState.removePlayer(effectivePlayerId);
          
          // Clean up socket mapping
          delete socketToPlayerMap[socket.id];
          
          // Save to database
          await gameDB.saveGameState(roomId, gameState.getState());
          await gameDB.removePlayer(roomId, effectivePlayerId);
          await gameDB.logAction(roomId, effectivePlayerId, 'player_disconnected');
          
          // If no players left, mark room for cleanup but don't delete immediately
          if (gameState.players.length === 0) {
            // Set a cleanup timeout instead of immediate deletion
            setTimeout(async () => {
              // Double-check that no players have rejoined
              if (rooms[roomId] && rooms[roomId].players.length === 0) {
                console.log(`🧹 Cleaning up empty room: ${roomId}`);
                delete rooms[roomId];
                performanceMonitor.trackRoomDeleted(roomId);
                
                // Archive the room in database
                try {
                  await gameDB.archiveGame(roomId);
                } catch (error) {
                  console.error(`Failed to archive room ${roomId}:`, error);
                }
              }
            }, 30000); // 30 second grace period for reconnection
          } else {
            // Broadcast updated state to remaining players
            io.to(roomId).emit("player_disconnected", gameState.getState());
          }
          
          console.log(`🔌 ${effectivePlayerId} disconnected from room ${roomId}`);
        }
      });
    } catch (error) {
      console.error('Error handling disconnect:', error);
      performanceMonitor.trackError(error, { action: 'disconnect' });
    }
  });
}

module.exports = { handleGameEvents, rooms };
