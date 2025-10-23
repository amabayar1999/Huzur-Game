const { GameState } = require("./gameState");

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> GameState
    this.playerRooms = new Map(); // socketId -> roomId
  }

  createRoom(roomId, creatorId) {
    if (this.rooms.has(roomId)) {
      return { success: false, error: "Room already exists" };
    }

    const gameState = new GameState();
    gameState.addPlayer(creatorId);
    
    this.rooms.set(roomId, gameState);
    this.playerRooms.set(creatorId, roomId);
    
    console.log(`🏠 Room ${roomId} created by ${creatorId}`);
    return { success: true, gameState: gameState.getState() };
  }

  joinRoom(roomId, playerId) {
    const gameState = this.rooms.get(roomId);
    if (!gameState) {
      return { success: false, error: "Room not found" };
    }

    if (gameState.players.length >= 4) { // Max 4 players
      return { success: false, error: "Room is full" };
    }

    if (gameState.players.includes(playerId)) {
      return { success: false, error: "Already in this room" };
    }

    gameState.addPlayer(playerId);
    this.playerRooms.set(playerId, roomId);
    
    console.log(`👤 ${playerId} joined room ${roomId}`);
    return { success: true, gameState: gameState.getState() };
  }

  leaveRoom(playerId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return { success: false, error: "Not in any room" };

    const gameState = this.rooms.get(roomId);
    if (!gameState) return { success: false, error: "Room not found" };

    gameState.removePlayer(playerId);
    this.playerRooms.delete(playerId);

    // Clean up empty rooms
    if (gameState.players.length === 0) {
      this.rooms.delete(roomId);
      console.log(`🗑️ Room ${roomId} deleted (empty)`);
    }

    console.log(`👋 ${playerId} left room ${roomId}`);
    return { success: true, roomId, gameState: gameState.getState() };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getPlayerRoom(playerId) {
    return this.playerRooms.get(playerId);
  }

  getRoomCount() {
    return this.rooms.size;
  }

  getTotalPlayers() {
    return this.playerRooms.size;
  }

  handlePlayerDisconnect(playerId) {
    const result = this.leaveRoom(playerId);
    return result;
  }

  // Get list of available rooms for lobby
  getAvailableRooms() {
    const availableRooms = [];
    for (const [roomId, gameState] of this.rooms.entries()) {
      if (gameState.players.length < 4 && !gameState.gameStarted) {
        availableRooms.push({
          roomId,
          playerCount: gameState.players.length,
          maxPlayers: 4,
          gameStarted: gameState.gameStarted
        });
      }
    }
    return availableRooms;
  }
}

module.exports = { RoomManager };
