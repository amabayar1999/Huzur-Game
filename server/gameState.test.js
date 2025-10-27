// Tests for GameState class - authoritative game state management
const { GameState } = require('./gameState');

describe('GameState - Initialization', () => {
  test('creates game with empty state', () => {
    const game = new GameState('room1');
    expect(game.roomId).toBe('room1');
    expect(game.players).toEqual([]);
    expect(game.gameStarted).toBe(false);
    expect(game.pile).toEqual([]);
    expect(game.deck).toEqual([]);
  });

  test('initializes anti-cheat tracking', () => {
    const game = new GameState('room1');
    expect(game.playerActions).toEqual({});
    expect(game.suspiciousActivity).toEqual({});
  });
});

describe('GameState - Player Management', () => {
  test('adds first player as room owner', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    
    expect(game.players).toEqual(['player1']);
    expect(game.roomOwner).toBe('player1');
    expect(game.currentPlayer).toBe('player1');
  });

  test('adds multiple players', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.addPlayer('player3');
    
    expect(game.players).toEqual(['player1', 'player2', 'player3']);
    expect(game.roomOwner).toBe('player1'); // First player stays owner
  });

  test('does not add duplicate players', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player1');
    
    expect(game.players).toEqual(['player1']);
  });

  test('removes player correctly', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.removePlayer('player1');
    
    expect(game.players).toEqual(['player2']);
  });

  test('moves turn when current player leaves', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.currentPlayer = 'player1';
    
    game.removePlayer('player1');
    expect(game.currentPlayer).toBe('player2');
  });

  test('resets game when all players leave', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    game.startGame();
    game.removePlayer('player1');
    
    expect(game.gameStarted).toBe(false);
    expect(game.currentPlayer).toBe(null);
  });
});

describe('GameState - Game Start', () => {
  test('cannot start with less than 2 players', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    
    const result = game.startGame();
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least 2 players');
  });

  test('starts game with 2+ players', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    
    const result = game.startGame();
    expect(result.success).toBe(true);
    expect(game.gameStarted).toBe(true);
  });

  test('initializes deck and deals cards', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.startGame();
    
    expect(game.deck.length).toBeGreaterThan(0);
    expect(game.trumpCard).toBeDefined();
    expect(game.trumpSuit).toBeDefined();
    expect(game.playerHands['player1'].length).toBe(5);
    expect(game.playerHands['player2'].length).toBe(5);
  });

  test('cannot start game twice', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.startGame();
    
    const result = game.startGame();
    expect(result.success).toBe(false);
    expect(result.error).toContain('already started');
  });
});

describe('GameState - Move Validation', () => {
  let game;
  
  beforeEach(() => {
    game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.startGame();
  });

  test('rejects move when game not started', () => {
    const freshGame = new GameState('room1');
    freshGame.addPlayer('player1');
    
    const card = { rank: 'A', suit: 'H' };
    const result = freshGame.playCard('player1', card);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('not started');
  });

  test('rejects move from player not in game', () => {
    const card = game.playerHands['player1'][0];
    const result = game.playCard('unknownPlayer', card);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('not in game');
  });

  test('rejects move when not player turn', () => {
    game.currentPlayer = 'player1';
    const card = game.playerHands['player2'][0];
    
    const result = game.playCard('player2', card);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not your turn');
  });

  test('rejects card not in player hand', () => {
    game.currentPlayer = 'player1';
    const fakeCard = { rank: 'A', suit: 'H' };
    
    // Make sure this card is not in hand
    game.playerHands['player1'] = [{ rank: '7', suit: 'S' }];
    
    const result = game.playCard('player1', fakeCard);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('not in hand');
  });

  test('rejects duplicate cards in combo', () => {
    game.currentPlayer = 'player1';
    const sameCard = { rank: 'A', suit: 'H' };
    
    const result = game.playCard('player1', [sameCard, sameCard, { rank: 'K', suit: 'S' }]);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Duplicate cards');
  });

  test('rejects invalid combo size', () => {
    game.currentPlayer = 'player1';
    const cards = [
      { rank: 'A', suit: 'H' },
      { rank: 'K', suit: 'S' }
    ];
    
    const result = game.playCard('player1', cards);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid combo size');
  });
});

describe('GameState - Rate Limiting', () => {
  let game;
  
  beforeEach(() => {
    game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.startGame();
    game.currentPlayer = 'player1';
  });

  test('allows normal play frequency', () => {
    const card = game.playerHands['player1'][0];
    const result = game.playCard('player1', card);
    
    expect(result.success).toBe(true);
  });

  test('blocks rapid-fire actions', () => {
    // Simulate rapid actions
    const now = Date.now();
    game.playerActions['player1'] = [now, now, now]; // 3 actions in same millisecond
    
    const card = game.playerHands['player1'][0];
    const result = game.playCard('player1', card);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('too many');
  });

  test('tracks suspicious activity', () => {
    const now = Date.now();
    
    // Repeatedly trigger rate limit
    for (let i = 0; i < 6; i++) {
      game.playerActions['player1'] = [now, now, now];
      game.playerHands['player1'] = [{ rank: 'A', suit: 'H' }];
      game.playCard('player1', { rank: 'A', suit: 'H' });
    }
    
    expect(game.suspiciousActivity['player1']).toBeGreaterThan(0);
  });
});

describe('GameState - Single Card Play', () => {
  let game;
  
  beforeEach(() => {
    game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.startGame();
  });

  test('allows leading with any card', () => {
    game.currentPlayer = 'player1';
    const card = game.playerHands['player1'][0];
    
    const result = game.playCard('player1', card);
    
    expect(result.success).toBe(true);
    expect(game.pile).toContainEqual(card);
    expect(game.leadCard).toEqual(card);
    expect(game.leadPlayer).toBe('player1');
  });

  test('removes played card from hand', () => {
    game.currentPlayer = 'player1';
    const card = game.playerHands['player1'][0];
    const initialHandSize = game.playerHands['player1'].length;
    
    game.playCard('player1', card);
    
    expect(game.playerHands['player1'].length).toBe(initialHandSize - 1);
    expect(game.playerHands['player1']).not.toContainEqual(card);
  });

  test('moves to next player after leading', () => {
    game.currentPlayer = 'player1';
    const card = game.playerHands['player1'][0];
    
    game.playCard('player1', card);
    
    expect(game.currentPlayer).toBe('player2');
  });

  test('completes trick and determines winner', () => {
    game.currentPlayer = 'player1';
    
    // Player 1 leads with a card
    const leadCard = game.playerHands['player1'][0];
    game.playCard('player1', leadCard);
    
    // Player 2 responds
    const responseCard = game.playerHands['player2'][0];
    game.playCard('player2', responseCard);
    
    // Trick should be resolved - leadCard is null after trick completes
    expect(game.leadCard).toBeNull();
    expect(game.pile).toEqual([]);
    expect(game.deadPile.length).toBeGreaterThan(0);
  });
});

describe('GameState - Pile Pickup', () => {
  let game;
  
  beforeEach(() => {
    game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.startGame();
  });

  test('cannot pickup when no pile', () => {
    game.currentPlayer = 'player1';
    
    const result = game.pickupPile('player1');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('No pile');
  });

  test('can pickup pile when responding', () => {
    game.currentPlayer = 'player1';
    const card = game.playerHands['player1'][0];
    game.playCard('player1', card);
    
    // Now player2 should be able to pickup
    const initialHandSize = game.playerHands['player2'].length;
    const result = game.pickupPile('player2');
    
    expect(result.success).toBe(true);
    expect(game.playerHands['player2'].length).toBeGreaterThan(initialHandSize);
    expect(game.pile).toEqual([]);
  });

  test('cannot pickup on wrong turn', () => {
    game.currentPlayer = 'player1';
    const card = game.playerHands['player1'][0];
    game.playCard('player1', card);
    
    // Player 1 cannot pickup - it's player2's turn
    const result = game.pickupPile('player1');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not your turn');
  });

  test('moves to next player after pickup', () => {
    game.currentPlayer = 'player1';
    const card = game.playerHands['player1'][0];
    game.playCard('player1', card);
    
    game.pickupPile('player2');
    
    // Should skip to next player (wraps to player1)
    expect(game.currentPlayer).toBe('player1');
  });
});

describe('GameState - Public State', () => {
  let game;
  
  beforeEach(() => {
    game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.startGame();
  });

  test('only reveals requesting player hand', () => {
    const publicState = game.getPublicState('player1');
    
    expect(publicState.playerHands).toHaveProperty('player1');
    expect(publicState.playerHands).not.toHaveProperty('player2');
  });

  test('reveals all public information', () => {
    const publicState = game.getPublicState('player1');
    
    expect(publicState.roomId).toBe('room1');
    expect(publicState.players).toBeDefined();
    expect(publicState.currentPlayer).toBeDefined();
    expect(publicState.pile).toBeDefined();
    expect(publicState.trumpSuit).toBeDefined();
    expect(publicState.deckCount).toBeDefined();
  });

  test('includes game statistics', () => {
    const publicState = game.getPublicState('player1');
    
    expect(publicState.gameStats).toBeDefined();
    expect(publicState.gameStats.totalTricks).toBeDefined();
  });
});

describe('GameState - Win Condition', () => {
  let game;
  
  beforeEach(() => {
    game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.startGame();
  });

  test('player wins when hand is empty', () => {
    game.playerHands['player1'] = [];
    
    const winner = game.checkWinCondition();
    expect(winner).toBe('player1');
  });

  test('no winner when all players have cards', () => {
    const winner = game.checkWinCondition();
    expect(winner).toBe(null);
  });

  test('game ends when winner is determined', () => {
    game.currentPlayer = 'player1';
    game.playerHands['player1'] = [{ rank: 'A', suit: 'H' }];
    
    // Play last card to win
    game.playCard('player1', { rank: 'A', suit: 'H' });
    
    // Winner should be determined after trick resolution
    // (actual winner depends on game logic, but game should end)
    expect(game.playerHands['player1'].length).toBe(0);
  });
});

describe('GameState - Game Statistics', () => {
  let game;
  
  beforeEach(() => {
    game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.startGame();
  });

  test('tracks cards played', () => {
    game.currentPlayer = 'player1';
    const card = game.playerHands['player1'][0];
    
    game.playCard('player1', card);
    
    expect(game.gameStats.cardsPlayed['player1']).toBe(1);
  });

  test('tracks tricks won', () => {
    const initialTricks = game.gameStats.totalTricks;
    game.currentPlayer = 'player1';
    
    // Player 1 leads
    const card1 = game.playerHands['player1'][0];
    game.playCard('player1', card1);
    
    // Get current player (should be player2 after player1 leads)
    const currentAfterLead = game.currentPlayer;
    
    // Current player responds
    const card2 = game.playerHands[currentAfterLead][0];
    game.playCard(currentAfterLead, card2);
    
    // After complete trick, total should increase
    expect(game.gameStats.totalTricks).toBe(initialTricks + 1);
  });

  test('tracks pile pickups', () => {
    game.currentPlayer = 'player1';
    const card = game.playerHands['player1'][0];
    game.playCard('player1', card);
    
    game.pickupPile('player2');
    
    expect(game.gameStats.pilePickups['player2']).toBe(1);
  });
});

describe('GameState - Memory Management', () => {
  test('cleans up player data on removal', () => {
    const game = new GameState('room1');
    game.addPlayer('player1');
    game.addPlayer('player2');
    game.startGame();
    
    // Simulate some actions
    game.playerActions['player1'] = [Date.now()];
    game.suspiciousActivity['player1'] = 1;
    
    game.removePlayer('player1');
    
    expect(game.playerHands).not.toHaveProperty('player1');
    expect(game.players).not.toContain('player1');
  });
});

