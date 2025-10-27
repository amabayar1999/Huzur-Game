// Tests for RoomManager - room lifecycle management
const { RoomManager } = require('./roomManager');

describe('RoomManager - Room Creation', () => {
  let manager;
  
  beforeEach(() => {
    manager = new RoomManager();
  });
  
  afterEach(() => {
    // Clean up timers to prevent leaks
    if (manager && manager.cleanupInterval) {
      clearInterval(manager.cleanupInterval);
    }
  });

  test('creates new room', () => {
    const result = manager.createRoom('room1', 'player1');
    
    expect(result.success).toBe(true);
    expect(result.gameState).toBeDefined();
    expect(manager.getRoomCount()).toBe(1);
  });

  test('sets creator as room owner', () => {
    const result = manager.createRoom('room1', 'player1');
    const room = manager.getRoom('room1');
    
    expect(room.roomOwner).toBe('player1');
    expect(room.players).toContain('player1');
  });

  test('tracks player room assignment', () => {
    manager.createRoom('room1', 'player1');
    
    expect(manager.getPlayerRoom('player1')).toBe('room1');
  });

  test('prevents duplicate room creation', () => {
    manager.createRoom('room1', 'player1');
    const result = manager.createRoom('room1', 'player2');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });
});

describe('RoomManager - Joining Rooms', () => {
  let manager;
  
  beforeEach(() => {
    manager = new RoomManager();
    manager.createRoom('room1', 'player1');
  });
  
  afterEach(() => {
    if (manager && manager.cleanupInterval) {
      clearInterval(manager.cleanupInterval);
    }
  });

  test('allows joining existing room', () => {
    const result = manager.joinRoom('room1', 'player2');
    
    expect(result.success).toBe(true);
    const room = manager.getRoom('room1');
    expect(room.players).toContain('player2');
  });

  test('prevents joining non-existent room', () => {
    const result = manager.joinRoom('room999', 'player2');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('prevents joining full room', () => {
    // Fill room to max capacity (2 players)
    manager.joinRoom('room1', 'player2');
    
    const result = manager.joinRoom('room1', 'player3');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('full');
  });

  test('prevents joining same room twice', () => {
    // Create a separate room for this test
    manager.createRoom('room2', 'player1');
    manager.joinRoom('room2', 'player2');
    const result = manager.joinRoom('room2', 'player2');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Already in this room');
  });

  test('tracks multiple players in room', () => {
    manager.joinRoom('room1', 'player2');
    
    const room = manager.getRoom('room1');
    expect(room.players.length).toBe(2);
    expect(manager.getTotalPlayers()).toBe(2);
  });
});

describe('RoomManager - Leaving Rooms', () => {
  let manager;
  
  beforeEach(() => {
    manager = new RoomManager();
    manager.createRoom('room1', 'player1');
    manager.joinRoom('room1', 'player2');
  });

  test('allows leaving room', () => {
    const result = manager.leaveRoom('player2');
    
    expect(result.success).toBe(true);
    const room = manager.getRoom('room1');
    expect(room.players).not.toContain('player2');
  });

  test('removes player from tracking', () => {
    manager.leaveRoom('player2');
    
    expect(manager.getPlayerRoom('player2')).toBeUndefined();
  });

  test('cannot leave if not in room', () => {
    const result = manager.leaveRoom('unknownPlayer');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not in any room');
  });

  test('deletes empty rooms', () => {
    manager.leaveRoom('player1');
    manager.leaveRoom('player2');
    
    expect(manager.getRoom('room1')).toBeUndefined();
    expect(manager.getRoomCount()).toBe(0);
  });
});

describe('RoomManager - Multiple Rooms', () => {
  let manager;
  
  beforeEach(() => {
    manager = new RoomManager();
  });

  test('supports multiple concurrent rooms', () => {
    manager.createRoom('room1', 'player1');
    manager.createRoom('room2', 'player2');
    manager.createRoom('room3', 'player3');
    
    expect(manager.getRoomCount()).toBe(3);
  });

  test('players can be in different rooms', () => {
    manager.createRoom('room1', 'player1');
    manager.createRoom('room2', 'player2');
    
    expect(manager.getPlayerRoom('player1')).toBe('room1');
    expect(manager.getPlayerRoom('player2')).toBe('room2');
  });

  test('manages player count across rooms', () => {
    manager.createRoom('room1', 'player1');
    manager.joinRoom('room1', 'player2');
    manager.createRoom('room2', 'player3');
    
    expect(manager.getTotalPlayers()).toBe(3);
  });
});

describe('RoomManager - Available Rooms', () => {
  let manager;
  
  beforeEach(() => {
    manager = new RoomManager();
  });

  test('lists available rooms', () => {
    manager.createRoom('room1', 'player1');
    manager.createRoom('room2', 'player2');
    
    const available = manager.getAvailableRooms();
    
    expect(available.length).toBe(2);
    expect(available[0]).toHaveProperty('roomId');
    expect(available[0]).toHaveProperty('playerCount');
    expect(available[0]).toHaveProperty('maxPlayers');
  });

  test('excludes full rooms', () => {
    manager.createRoom('room1', 'player1');
    manager.joinRoom('room1', 'player2');
    
    const available = manager.getAvailableRooms();
    
    expect(available).toEqual([]);
  });

  test('excludes started games', () => {
    manager.createRoom('room1', 'player1');
    manager.joinRoom('room1', 'player2');
    
    const room = manager.getRoom('room1');
    room.startGame();
    
    const available = manager.getAvailableRooms();
    
    expect(available).toEqual([]);
  });

  test('shows player count correctly', () => {
    manager.createRoom('room1', 'player1');
    manager.joinRoom('room1', 'player2');
    
    const available = manager.getAvailableRooms();
    
    expect(available[0].playerCount).toBe(2);
    expect(available[0].maxPlayers).toBe(2);
  });
});

describe('RoomManager - Player Disconnection', () => {
  let manager;
  
  beforeEach(() => {
    manager = new RoomManager();
    manager.createRoom('room1', 'player1');
    manager.joinRoom('room1', 'player2');
  });

  test('handles player disconnect', () => {
    const result = manager.handlePlayerDisconnect('player2');
    
    expect(result.success).toBe(true);
    const room = manager.getRoom('room1');
    expect(room.players).not.toContain('player2');
  });

  test('cleans up empty room on disconnect', () => {
    manager.handlePlayerDisconnect('player1');
    manager.handlePlayerDisconnect('player2');
    
    expect(manager.getRoom('room1')).toBeUndefined();
  });

  test('handles disconnect of non-existent player', () => {
    const result = manager.handlePlayerDisconnect('unknownPlayer');
    
    expect(result.success).toBe(false);
  });
});

describe('RoomManager - Room Lookup', () => {
  let manager;
  
  beforeEach(() => {
    manager = new RoomManager();
  });

  test('finds room by ID', () => {
    manager.createRoom('room1', 'player1');
    
    const room = manager.getRoom('room1');
    expect(room).toBeDefined();
    expect(room.roomId).toBe('room1');
  });

  test('returns undefined for non-existent room', () => {
    const room = manager.getRoom('room999');
    expect(room).toBeUndefined();
  });

  test('finds player room', () => {
    manager.createRoom('room1', 'player1');
    
    const roomId = manager.getPlayerRoom('player1');
    expect(roomId).toBe('room1');
  });

  test('returns undefined for unassigned player', () => {
    const roomId = manager.getPlayerRoom('unknownPlayer');
    expect(roomId).toBeUndefined();
  });
});

describe('RoomManager - Statistics', () => {
  let manager;
  
  beforeEach(() => {
    manager = new RoomManager();
  });

  test('tracks room count', () => {
    expect(manager.getRoomCount()).toBe(0);
    
    manager.createRoom('room1', 'player1');
    expect(manager.getRoomCount()).toBe(1);
    
    manager.createRoom('room2', 'player2');
    expect(manager.getRoomCount()).toBe(2);
  });

  test('tracks total player count', () => {
    expect(manager.getTotalPlayers()).toBe(0);
    
    manager.createRoom('room1', 'player1');
    expect(manager.getTotalPlayers()).toBe(1);
    
    manager.joinRoom('room1', 'player2');
    expect(manager.getTotalPlayers()).toBe(2);
  });

  test('updates statistics on player removal', () => {
    manager.createRoom('room1', 'player1');
    manager.joinRoom('room1', 'player2');
    
    manager.leaveRoom('player2');
    
    expect(manager.getTotalPlayers()).toBe(1);
  });
});

describe('RoomManager - Edge Cases', () => {
  let manager;
  
  beforeEach(() => {
    manager = new RoomManager();
  });

  test('handles rapid room creation', () => {
    for (let i = 0; i < 100; i++) {
      manager.createRoom(`room${i}`, `player${i}`);
    }
    
    expect(manager.getRoomCount()).toBe(100);
    expect(manager.getTotalPlayers()).toBe(100);
  });

  test('handles player switching rooms', () => {
    manager.createRoom('room1', 'player1');
    manager.createRoom('room2', 'player2');
    
    // Player1 leaves room1 and joins room2
    manager.leaveRoom('player1');
    manager.joinRoom('room2', 'player1');
    
    expect(manager.getPlayerRoom('player1')).toBe('room2');
    expect(manager.getRoom('room2').players).toContain('player1');
  });

  test('maintains data integrity after errors', () => {
    manager.createRoom('room1', 'player1');
    
    // Try invalid operation
    manager.joinRoom('room999', 'player2');
    
    // Should still work correctly
    const result = manager.joinRoom('room1', 'player2');
    expect(result.success).toBe(true);
  });
});

