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

// Player ID to Room ID mapping for quick lookup
const playerRooms = {};

// Helper function to get effective player ID from socket
function getEffectivePlayerId(socket) {
  return socketToPlayerMap[socket.id] || socket.id;
}

function handleGameEvents(io, socket) {
  // Helper: emit per-socket public state to all sockets in room
  async function broadcastPublicState(roomId, eventName, gameState) {
    const sockets = await io.in(roomId).fetchSockets();
    for (const s of sockets) {
      const pid = socketToPlayerMap[s.id] || s.id;
      s.emit(eventName, gameState.getPublicState(pid));
    }
  }
  
  // 1️⃣ CREATE ROOM
  socket.on("create_room", async (data, ack) => {
    const effectivePlayerId = data.playerId || socket.id;

    // ✅ FIX 1: Prevent multiple rooms per host
    const existingRoom = Object.values(rooms).find(r => r.roomOwner === effectivePlayerId);
    if (existingRoom) {
      console.warn(`⚠️ ${effectivePlayerId} already owns room ${existingRoom.roomId} - reusing existing room`);
      
      // Rebind socket mappings
      socketToPlayerMap[socket.id] = effectivePlayerId;
      playerRooms[effectivePlayerId] = existingRoom.roomId;
      socket.join(existingRoom.roomId);
      
      // Send ACK with existing room state
      ack?.({ ok: true, data: { 
        roomId: existingRoom.roomId,
        gameState: existingRoom.getPublicState(effectivePlayerId) 
      }});
      
      // Also emit room_created event for consistency
      socket.emit("room_created", { 
        roomId: existingRoom.roomId, 
        gameState: existingRoom.getPublicState(effectivePlayerId) 
      });
      
      return;
    }

    // ✅ FIX 2: Normalize roomId (handle empty string)
    const requestedRoomId = data.roomId?.trim() || null;
    const roomId = requestedRoomId || Math.random().toString(36).substr(2, 6);

    // ✅ FIX 3: If this room already exists, reuse it instead of failing
    if (rooms[roomId]) {
      console.warn(`⚠️ Room ${roomId} already exists - reusing existing GameState`);
      
      const existingGameState = rooms[roomId];
      
      // If player is not in the room, add them
      if (!existingGameState.hasPlayer(effectivePlayerId)) {
        existingGameState.addPlayer(effectivePlayerId);
        await gameDB.addPlayer(roomId, effectivePlayerId);
      }
      
      // Rebind socket mappings
      socketToPlayerMap[socket.id] = effectivePlayerId;
      playerRooms[effectivePlayerId] = roomId;
      socket.join(roomId);
      
      // Send ACK with existing room state
      ack?.({ ok: true, data: { 
        roomId, 
        gameState: existingGameState.getPublicState(effectivePlayerId) 
      }});
      
      // Also emit room_created event for consistency
      socket.emit("room_created", { 
        roomId, 
        gameState: existingGameState.getPublicState(effectivePlayerId) 
      });
      
      return;
    }
    
    try {
      // Create new game state
      const gameState = new GameState(roomId);
      
      // ✅ FIX 4: Explicitly set room owner (already done in addPlayer, but be explicit)
      gameState.addPlayer(effectivePlayerId);
      gameState.roomOwner = effectivePlayerId; // Explicit assignment
      
      // Store mappings
      socketToPlayerMap[socket.id] = effectivePlayerId;
      playerRooms[effectivePlayerId] = roomId;
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
        gameState: gameState.getPublicState(effectivePlayerId) 
      });
      
      // Send ACK response
      ack?.({ ok: true, data: { 
        roomId,  // ✅ FIX: Include roomId in ACK
        gameState: gameState.getPublicState(effectivePlayerId) 
      }});
      
      console.log(`🏠 Room ${roomId} created by ${effectivePlayerId}`);
    } catch (error) {
      console.error('Error creating room:', error);
      const errorRoomId = typeof roomId !== 'undefined' ? roomId : 'unknown';
      performanceMonitor.trackError(error, { action: 'create_room', roomId: errorRoomId });
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
      const fail = { ok: false, error: { message: "Game already started", code: 'GAME_ALREADY_STARTED' } };
      ack?.(fail);
      // Inform client so it can choose to spectate/navigate appropriately
      socket.emit('game_already_started', { roomId });
      return;
    }

    try {
      // Store socket to player mapping
      socketToPlayerMap[socket.id] = effectivePlayerId;
      
    // ✅ Rejoining logic - check by playerId first, then socket.id
    if (gameState.hasPlayer(effectivePlayerId)) {
      console.log(`♻️ Reconnection detected for ${effectivePlayerId}`);
      
      // Join socket to existing room
      socket.join(roomId);
      
      // Rebind mapping
      socketToPlayerMap[socket.id] = effectivePlayerId;
      playerRooms[effectivePlayerId] = roomId;
      
      // Mark player as online again
      if (gameState.disconnectedPlayers) {
        delete gameState.disconnectedPlayers[effectivePlayerId];
      }
      
      // ✅ FIX: Check playerHands before rejoin to verify cards are still there
      console.log("♻️ HAND CHECK:", JSON.stringify(gameState.playerHands));
      
      // Send their full current state (with their hand)
      const payload = {
        roomId,
        gameState: gameState.getPublicState(effectivePlayerId),
      };
      
      socket.emit("room_rejoined", payload);
      // ✅ AUTOMATIC LOADING: Always include game state in ACK response for rejoin
      ack?.({ ok: true, data: payload });
      
      // Let other players know
      socket.to(roomId).emit("player_reconnected", { playerId: effectivePlayerId });
      
      return;
    }

      // ✅ New player joining (game not started)
      gameState.addPlayer(effectivePlayerId);
      socket.join(roomId);
      
      // Store mappings
      socketToPlayerMap[socket.id] = effectivePlayerId;
      playerRooms[effectivePlayerId] = roomId;

      await gameDB.saveGameState(roomId, gameState.getState());
      await gameDB.addPlayer(roomId, effectivePlayerId);
      await gameDB.logAction(roomId, effectivePlayerId, "player_joined");

      // Send current state to the joining player
      const payload = {
        roomId,
        gameState: gameState.getPublicState(effectivePlayerId),
      };
      socket.emit("room_joined", payload);
      // ✅ AUTOMATIC LOADING: Always include game state in ACK response
      ack?.({ ok: true, data: payload });

      // Broadcast complete state to other players (using getState to include all fields)
      // Note: getState() doesn't reveal other players' hands, it only shows card counts
      socket.to(roomId).emit("player_joined", gameState.getState());

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
      const roomId = playerRooms[effectivePlayerId] || Object.keys(rooms).find(id => 
        rooms[id].players.includes(effectivePlayerId)
      );
      
      if (!roomId) {
        socket.emit("server_error", { message: "Not in any room" });
        return;
      }
      
      const gameState = rooms[roomId];
      gameState.removePlayer(effectivePlayerId);
      socket.leave(roomId);
      
      // Clean up socket mapping and player room mapping
      delete socketToPlayerMap[socket.id];
      delete playerRooms[effectivePlayerId];
      
      // Save to database
      await gameDB.saveGameState(roomId, gameState.getState());
      await gameDB.removePlayer(roomId, effectivePlayerId);
      await gameDB.logAction(roomId, effectivePlayerId, 'player_left');
      
      // If no players left, delete room
      if (gameState.players.length === 0) {
        delete rooms[roomId];
        performanceMonitor.trackRoomDeleted(roomId);
      } else {
        // Broadcast per-player public state to remaining players
        await broadcastPublicState(roomId, "player_left", gameState);
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
        const payload = { roomId, gameState: gameState.getPublicState(effectivePlayerId) };
        ack?.({ ok: true, data: payload }); // ✅ ACK first
        // Send per-player public state to each socket in the room
        const sockets = await io.in(roomId).fetchSockets();
        for (const s of sockets) {
          const pid = socketToPlayerMap[s.id] || s.id;
          s.emit("game_started", { roomId, gameState: gameState.getPublicState(pid) });
        }
        return;
      }

      // ✅ Check if player is room owner
      if (gameState.roomOwner !== effectivePlayerId) {
        console.log("❌ Player is not room owner:", effectivePlayerId, "roomOwner:", gameState.roomOwner);
        const fail = { ok: false, error: { message: "Only the room owner can start the game", code: 'NOT_ROOM_OWNER' } };
        ack?.(fail);
        return;
      }

      // ✅ Atomic guard: prevent concurrent start_game calls
      if (gameState.starting) {
        console.log("⚠️ Game start already in progress for", roomId);
        ack?.({ ok: false, error: { message: "Game already starting", code: 'GAME_STARTING' } });
        return;
      }
      gameState.starting = true;

      const result = gameState.startGame();
      if (!result.success) {
        console.log("❌ startGame() failed:", result.error);
        // Clear the starting flag on failure
        delete gameState.starting;
        const fail = { ok: false, error: { message: result.error, code: 'GAME_START_FAILED' } };
        ack?.(fail); // ✅ ACK immediately on failure
        return;
      }

      // ✅ Game successfully started - ACK before async operations
      const payload = { roomId, gameState: gameState.getPublicState(effectivePlayerId) };
      ack?.({ ok: true, data: payload }); // ✅ ACK first to prevent timeout
      
      // Then do async operations
      await gameDB.saveGameState(roomId, gameState.getState());
      await gameDB.logAction(roomId, socket.id, "game_started");
      performanceMonitor.trackGameStarted(roomId, gameState.players.length);

      // ② EMIT DEBUG - Check playerHands before sending to clients
      console.log("🃏 EMIT DEBUG – playerHands snapshot before send:",
        JSON.stringify(gameState.playerHands, null, 2));

      // ✅ VERIFY: Ensure cards were actually dealt
      const allPlayersHaveCards = gameState.players.every(pid => {
        const hasCards = gameState.playerHands[pid] && gameState.playerHands[pid].length > 0;
        if (!hasCards) {
          console.error(`❌ Player ${pid} has no cards!`, {
            playerHands: gameState.playerHands[pid],
            playerHandsKeys: Object.keys(gameState.playerHands)
          });
        }
        return hasCards;
      });
      
      if (!allPlayersHaveCards) {
        console.error(`❌ CRITICAL: Not all players have cards!`, {
          players: gameState.players,
          playerHands: gameState.playerHands,
          playerHandsKeys: Object.keys(gameState.playerHands)
        });
      } else {
        console.log(`✅ All players have cards:`, gameState.players.map(pid => ({
          playerId: pid,
          cardCount: gameState.playerHands[pid]?.length || 0
        })));
      }

      // Send per-player public state to each socket in the room
      const sockets = await io.in(roomId).fetchSockets();
      for (const s of sockets) {
        let pid = socketToPlayerMap[s.id] || s.id;
        
        // ✅ FIX: Ensure playerId is in the players array (cards are dealt to players in this.players)
        // If the mapped playerId isn't in players, find the correct playerId from the players array
        if (!gameState.players.includes(pid)) {
          console.warn(`⚠️ Mapped playerId ${pid} not in players array. Players:`, gameState.players);
          
          // Find the playerId from players array that has this socket.id mapped to it
          const correctPlayerId = gameState.players.find(playerId => {
            // Check all socket mappings to see if this socket.id maps to this playerId
            return Object.keys(socketToPlayerMap).some(socketId => 
              socketId === s.id && socketToPlayerMap[socketId] === playerId
            );
          });
          
          if (correctPlayerId) {
            pid = correctPlayerId;
            // Update mapping for future use
            socketToPlayerMap[s.id] = pid;
            console.log(`✅ Fixed playerId mapping: socket ${s.id} -> ${pid}`);
          } else {
            // Last resort: use the first player (shouldn't happen, but better than failing)
            console.error(`❌ Could not find correct playerId for socket ${s.id}. Socket mapping:`, 
              socketToPlayerMap[s.id], 'Players:', gameState.players);
            // Try to use the mapped value if it's close, otherwise use first player
            if (gameState.players.length > 0) {
              console.warn(`⚠️ Using fallback: first player in array: ${gameState.players[0]}`);
              pid = gameState.players[0];
            }
          }
        }
        
        // ✅ DEBUG: Log playerId mapping
        console.log(`🎮 Broadcasting game_started to socket ${s.id}:`, {
          socketId: s.id,
          mappedPlayerId: pid,
          playersInGame: gameState.players,
          playerHandsKeys: Object.keys(gameState.playerHands),
          playerInPlayers: gameState.players.includes(pid),
          playerHasHand: gameState.playerHands[pid] ? gameState.playerHands[pid].length : 0
        });
        
        const publicState = gameState.getPublicState(pid);
        
        // ✅ DEBUG: Log what's being sent
        console.log(`🎮 Sending game_started to ${pid}:`, {
          handLength: publicState.hand?.length || 0,
          handIsArray: Array.isArray(publicState.hand),
          playerHandsKeys: Object.keys(publicState.playerHands || {}),
          playerHandsLength: publicState.playerHands?.[pid]?.length || 0,
          hasHandProperty: 'hand' in publicState,
          hasPlayerHandsProperty: 'playerHands' in publicState
        });
        
        // ✅ VERIFY: Ensure hand and playerHands are actually in the object before sending
        if (!publicState.hand || !Array.isArray(publicState.hand)) {
          console.error(`❌ CRITICAL: publicState.hand is missing or not an array for ${pid}!`, {
            publicStateKeys: Object.keys(publicState),
            hand: publicState.hand,
            playerHands: publicState.playerHands
          });
        }
        
        if (!publicState.playerHands || !publicState.playerHands[pid]) {
          console.error(`❌ CRITICAL: publicState.playerHands[${pid}] is missing!`, {
            publicStatePlayerHands: publicState.playerHands,
            publicStateKeys: Object.keys(publicState)
          });
        }
        
        // ✅ Send the data
        const payload = { roomId, gameState: publicState };
        
        // ✅ Final verification before emit
        console.log(`📤 Emitting game_started to ${pid} with payload:`, {
          roomId: payload.roomId,
          gameStateKeys: Object.keys(payload.gameState || {}),
          hasHand: 'hand' in (payload.gameState || {}),
          hasPlayerHands: 'playerHands' in (payload.gameState || {}),
          handLength: payload.gameState?.hand?.length || 0,
          playerHandsKeys: payload.gameState?.playerHands ? Object.keys(payload.gameState.playerHands) : []
        });
        
        s.emit("game_started", payload);
      }
      
      // Clear the starting flag after broadcast completes
      delete gameState.starting;
      
      // ✅ Final hands snapshot for debugging
      console.log("✅ Final hands snapshot:", JSON.stringify(gameState.playerHands, null, 2));
      console.log(`🎮 Game started in room ${roomId}`);
    } catch (error) {
      console.error("💥 start_game error:", error);
      performanceMonitor.trackError(error, { action: "start_game" });
      // Clear the starting flag on error
      if (roomId && rooms[roomId]) {
        delete rooms[roomId].starting;
      }
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
        
        // Broadcast per-player public state to all players
        await broadcastPublicState(roomId, "update_state", gameState);
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
        
        // Broadcast per-player public state to all players
        await broadcastPublicState(roomId, "update_state", gameState);
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
      socket.emit("room_state", gameState.getPublicState(effectivePlayerId));
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
      
      // Use in-memory public state if available, otherwise database state
      const currentState = gameState ? gameState.getPublicState(effectivePlayerId) : dbState;
      
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
      const roomId = playerRooms[effectivePlayerId];
      
      if (!effectivePlayerId || !roomId) {
        // Socket wasn't associated with a player/room, just clean up mapping
        delete socketToPlayerMap[socket.id];
        return;
      }

      const gameState = rooms[roomId];
      if (!gameState) {
        // Room doesn't exist, clean up mapping
        delete socketToPlayerMap[socket.id];
        delete playerRooms[effectivePlayerId];
        return;
      }

      if (!gameState.players.includes(effectivePlayerId)) {
        // Player not in this game, clean up mapping
        delete socketToPlayerMap[socket.id];
        if (playerRooms[effectivePlayerId] === roomId) {
          delete playerRooms[effectivePlayerId];
        }
        return;
      }

      console.log(`🔌 ${effectivePlayerId} disconnected from ${roomId}`);

      // 👇 Mark player as disconnected but keep their cards
      gameState.disconnectedPlayers = gameState.disconnectedPlayers || {};
      gameState.disconnectedPlayers[effectivePlayerId] = true;

      // Don't remove them from players[]
      // Don't clear playerHands[effectivePlayerId]

      // Log disconnection but keep player in game
      await gameDB.logAction(roomId, effectivePlayerId, 'player_disconnected');
      
      // Save current state (with player still in game)
      await gameDB.saveGameState(roomId, gameState.getState());

      // Optional: broadcast to others
      socket.to(roomId).emit("player_disconnected", { playerId: effectivePlayerId });

      // Clean socket references
      delete socketToPlayerMap[socket.id];
      // Note: Keep playerRooms[effectivePlayerId] so we can find room on reconnect

      // Optional: if everyone disconnected, clean up after a timeout
      const disconnectedCount = Object.keys(gameState.disconnectedPlayers || {}).length;
      if (disconnectedCount === gameState.players.length) {
        console.log(`🧹 All players disconnected from ${roomId} — scheduling cleanup`);
        setTimeout(() => {
          // Double-check that all players are still disconnected
          const stillDisconnected = Object.keys(gameState.disconnectedPlayers || {}).length;
          if (stillDisconnected === gameState.players.length && rooms[roomId]) {
            console.log(`🧹 Room ${roomId} cleaned up`);
            delete rooms[roomId];
            performanceMonitor.trackRoomDeleted(roomId);
            
            // Archive the room in database
            try {
              gameDB.archiveGame(roomId).catch(err => 
                console.error(`Failed to archive room ${roomId}:`, err)
              );
            } catch (error) {
              console.error(`Failed to archive room ${roomId}:`, error);
            }
          }
        }, 60000); // 1-minute grace period
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
      performanceMonitor.trackError(error, { action: 'disconnect' });
    }
  });
}

module.exports = { handleGameEvents, rooms };
