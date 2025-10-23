function handleGameEvents(io, socket, roomManager) {
  
  // Create a new room
  socket.on("create_room", (data) => {
    const roomId = data.roomId || Math.random().toString(36).substr(2, 6);
    const result = roomManager.createRoom(roomId, socket.id);
    
    if (result.success) {
      socket.join(roomId);
      socket.emit("room_created", { 
        roomId, 
        gameState: result.gameState 
      });
      console.log(`🏠 Room ${roomId} created by ${socket.id}`);
    } else {
      socket.emit("error", { message: result.error });
    }
  });

  // Join an existing room
  socket.on("join_room", (data) => {
    const { roomId } = data;
    const result = roomManager.joinRoom(roomId, socket.id);
    
    if (result.success) {
      socket.join(roomId);
      socket.emit("room_joined", { 
        roomId, 
        gameState: result.gameState 
      });
      
      // Notify other players in the room
      socket.to(roomId).emit("player_joined", {
        playerId: socket.id,
        gameState: result.gameState
      });
      
      console.log(`👤 ${socket.id} joined room ${roomId}`);
    } else {
      socket.emit("error", { message: result.error });
    }
  });

  // Leave current room
  socket.on("leave_room", () => {
    const result = roomManager.leaveRoom(socket.id);
    
    if (result.success) {
      socket.leave(result.roomId);
      socket.emit("room_left", { roomId: result.roomId });
      
      // Notify other players
      socket.to(result.roomId).emit("player_left", {
        playerId: socket.id,
        gameState: result.gameState
      });
    }
  });

  // Start the game
  socket.on("start_game", () => {
    const roomId = roomManager.getPlayerRoom(socket.id);
    if (!roomId) {
      socket.emit("error", { message: "Not in any room" });
      return;
    }
    
    const gameState = roomManager.getRoom(roomId);
    const result = gameState.startGame();
    
    if (result.success) {
      io.to(roomId).emit("game_started", result.gameState);
      console.log(`🎮 Game started in room ${roomId}`);
    } else {
      socket.emit("error", { message: result.error });
    }
  });

  // Play a card
  socket.on("play_card", (data) => {
    const { card } = data;
    const roomId = roomManager.getPlayerRoom(socket.id);
    
    if (!roomId) {
      socket.emit("error", { message: "Not in any room" });
      return;
    }
    
    const gameState = roomManager.getRoom(roomId);
    const result = gameState.playCard(socket.id, card);
    
    if (result.success) {
      // Broadcast to all players in the room
      io.to(roomId).emit("card_played", {
        playerId: socket.id,
        card,
        gameState: result.gameState
      });
      
      console.log(`🃏 ${socket.id} played card in room ${roomId}`);
    } else {
      socket.emit("error", { message: result.error });
    }
  });

  // Pick up pile
  socket.on("pickup_pile", () => {
    const roomId = roomManager.getPlayerRoom(socket.id);
    
    if (!roomId) {
      socket.emit("error", { message: "Not in any room" });
      return;
    }
    
    const gameState = roomManager.getRoom(roomId);
    const result = gameState.pickupPile(socket.id);
    
    if (result.success) {
      // Broadcast to all players in the room
      io.to(roomId).emit("pile_picked_up", {
        playerId: socket.id,
        gameState: result.gameState
      });
      
      console.log(`📥 ${socket.id} picked up pile in room ${roomId}`);
    } else {
      socket.emit("error", { message: result.error });
    }
  });

  // Get available rooms for lobby
  socket.on("get_rooms", () => {
    const rooms = roomManager.getAvailableRooms();
    socket.emit("rooms_list", { rooms });
  });

  // Get current room state
  socket.on("get_room_state", () => {
    const roomId = roomManager.getPlayerRoom(socket.id);
    if (!roomId) {
      socket.emit("error", { message: "Not in any room" });
      return;
    }
    
    const gameState = roomManager.getRoom(roomId);
    const publicState = gameState.getPublicState(socket.id);
    
    socket.emit("room_state", publicState);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    const result = roomManager.handlePlayerDisconnect(socket.id);
    
    if (result.success) {
      socket.to(result.roomId).emit("player_disconnected", {
        playerId: socket.id,
        gameState: result.gameState
      });
    }
  });
}

module.exports = { handleGameEvents };
