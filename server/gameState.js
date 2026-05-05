// Authoritative Game State - Single Source of Truth
const { canPlayCard, canPlayCombo, isCombo, canBeat, mustFollowSuit, isTrump, canBeatComboByPosition, determineTrickWinner } = require('./gameLogic');
const { logger } = require('./logger');

class GameState {
  constructor(roomId) {
    // ✅ Optional safeguard: prevent duplicate GameState instances
    if (global.__existingRoomStates?.has(roomId)) {
      console.log(`🚫 Duplicate GameState creation blocked for ${roomId} - reusing existing instance`);
      return global.__existingRoomStates.get(roomId);
    }
    
    this.roomId = roomId;
    this.players = [];
    this.roomOwner = null;
    this.started = false;
    this.currentPlayer = null;
    this.leadPlayer = null;
    this.leadCard = null;
    this.pile = [];
    this.deck = [];
    this.trumpSuit = null;
    this.trumpCard = null;
    this.trumpCardDrawn = false;
    this.playerHands = {};
    this.deadPile = [];
    this.winner = null;
    this.log = [];
    this.lastPlay = {};
    this.createdAt = new Date();
    
    // Transient flag to prevent concurrent starts
    this.starting = false;
    
    // ✅ Log management - prevent unbounded growth
    this.MAX_LOG_SIZE = 100; // Keep only last 100 entries
    this.fullLog = []; // Complete log for debugging
    
    // Anti-cheat measures
    this.playerActions = {}; // Track player actions for rate limiting
    this.suspiciousActivity = {}; // Track suspicious behavior
    
    // Connection tracking
    this.disconnectedPlayers = {}; // Track which players are offline (but still in game)
    
    // Game statistics
    this.gameStats = {
      totalTricks: 0,
      tricksWon: {},
      cardsPlayed: {},
      combosPlayed: {},
      jokersPlayed: {},
      trumpCardsPlayed: {},
      pilePickups: {},
      gameStartTime: null,
      gameEndTime: null,
      totalGameTime: 0
    };
    
    // ✅ Store instance in global registry to prevent duplicates
    global.__existingRoomStates = global.__existingRoomStates || new Map();
    global.__existingRoomStates.set(roomId, this);
  }

  // ✅ Add log entry with automatic pagination
  addLog(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    // Add to full log for debugging
    this.fullLog.push(logEntry);
    
    // Add to display log with pagination
    this.log.push(logEntry);
    
    // Keep only last MAX_LOG_SIZE entries in display log
    if (this.log.length > this.MAX_LOG_SIZE) {
      this.log.shift(); // Remove oldest entry
    }
  }
  
  // Get full log for debugging (not sent to clients)
  getFullLog() {
    return this.fullLog;
  }

  // Check if player is in the game
  hasPlayer(playerId) {
    return this.players.includes(playerId);
  }

  // Add player to game
  addPlayer(playerId) {
    if (!this.players.includes(playerId)) {
      this.players.push(playerId);
      // ✅ FIX: Only initialize empty hand if game hasn't started or player doesn't have cards yet
      // This prevents overwriting existing hands when a player reconnects
      if (!this.playerHands[playerId]) {
        this.playerHands[playerId] = [];
      }
      
      // Set room owner if first player
      if (!this.roomOwner) {
        this.roomOwner = playerId;
      }
      
      // Set current player if first player
      if (!this.currentPlayer) {
        this.currentPlayer = playerId;
      }
    }
  }

  // Remove player from game
  removePlayer(playerId) {
    this.players = this.players.filter(p => p !== playerId);
    delete this.playerHands[playerId];
    
    // ✅ Clean up anti-cheat tracking to prevent memory leaks
    delete this.playerActions[playerId];
    delete this.suspiciousActivity[playerId];
    
    // ✅ Clean up game statistics
    if (this.gameStats.tricksWon) delete this.gameStats.tricksWon[playerId];
    if (this.gameStats.cardsPlayed) delete this.gameStats.cardsPlayed[playerId];
    if (this.gameStats.combosPlayed) delete this.gameStats.combosPlayed[playerId];
    if (this.gameStats.jokersPlayed) delete this.gameStats.jokersPlayed[playerId];
    if (this.gameStats.trumpCardsPlayed) delete this.gameStats.trumpCardsPlayed[playerId];
    if (this.gameStats.pilePickups) delete this.gameStats.pilePickups[playerId];
    
    // ✅ Clean up last play data
    delete this.lastPlay[playerId];
    
    // If removed player was current player, move to next
    if (this.currentPlayer === playerId) {
      this.nextTurn();
    }
    
    // If no players left, keep game state intact for reconnection.
    // Room-level cleanup/archival is handled by the server after a grace period.
    if (this.players.length === 0) {
      // Intentionally no hard reset here to avoid unintended re-starts.
    }
  }

  // Start the game - ONLY server can do this
  startGame() {
    if (this.players.length < 2) {
      return { success: false, error: "Need at least 2 players to start" };
    }
    
    // Strong idempotency: if already started or cards already dealt, do nothing
    // Note: this.starting is checked at handler level, not here
    if (this.started || this.playersDealt()) {
      this.addLog("⚠️ Attempted to start twice – ignored");
      return { success: true, info: "Game already started" };
    }
    
    // this.starting is set by handler before calling this method
    // this.started will be set here to mark game as started
    this.started = true;
    this.currentPlayer = this.players[0];
    this.initializeGameStats();
    this.initializeHuzurGame();
    
    this.addLog(`Game started with ${this.players.length} players`);
    this.addLog(`Cards dealt to all players`);
    
    // Note: this.starting is cleared by handler after broadcast
    return { success: true };
  }

  // Initialize game statistics
  initializeGameStats() {
    this.gameStats.gameStartTime = new Date();
    this.gameStats.totalTricks = 0;
    
    for (const playerId of this.players) {
      this.gameStats.tricksWon[playerId] = 0;
      this.gameStats.cardsPlayed[playerId] = 0;
      this.gameStats.combosPlayed[playerId] = 0;
      this.gameStats.jokersPlayed[playerId] = 0;
      this.gameStats.trumpCardsPlayed[playerId] = 0;
      this.gameStats.pilePickups[playerId] = 0;
    }
  }

  // Initialize Huzur game with proper deck and card dealing
  initializeHuzurGame() {
    // Guard against double-initialization
    if (this.playersDealt()) {
      return;
    }
    // Create and shuffle deck
    this.deck = this.createDeck();
    this.shuffleDeck();
    
    // Set trump card (bottom card of deck)
    this.trumpCard = this.deck[0];
    this.trumpSuit = this.getTrumpSuit(this.trumpCard);
    this.trumpCardDrawn = false;
    
    // Deal 5 cards to each player
    this.dealCards();
    
    this.addLog(`Trump is ${this.trumpSuit} from ${this.formatCard(this.trumpCard)}`);
    this.addLog(`5-card combos will be unlocked when the trump card is drawn!`);
  }

  // Check if any player already has been dealt cards
  playersDealt() {
    for (const pid of this.players) {
      const hand = this.playerHands[pid];
      if (hand && hand.length > 0) return true;
    }
    return false;
  }

  // Create standard 54-card deck
  createDeck() {
    const suits = ['H', 'S', 'D', 'C'];
    const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', '3', '2', 'A'];
    const deck = [];
    
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ rank, suit });
      }
    }
    
    // Add jokers
    deck.push({ rank: 'BJ', suit: null });
    deck.push({ rank: 'RJ', suit: null });
    
    return deck;
  }

  // Shuffle deck
  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  // Get trump suit from card
  getTrumpSuit(card) {
    if (card.rank === 'BJ') return 'S';
    if (card.rank === 'RJ') return 'H';
    return card.suit;
  }

  // Deal cards to all players
  dealCards() {
    const cardsPerPlayer = 5;
    
    // Initialize empty hands for all players
    for (const playerId of this.players) {
      this.playerHands[playerId] = [];
    }
    
    for (let i = 0; i < cardsPerPlayer; i++) {
      for (const playerId of this.players) {
        if (this.deck.length > 0) {
          const card = this.deck.pop();
          this.playerHands[playerId].push(card);
        }
      }
    }
    
    // ① DEAL DEBUG - Check if cards were dealt correctly
    console.log("🂡 DEAL DEBUG – playerHands after dealing:",
      JSON.stringify(this.playerHands, null, 2));
  }

  // Play a card - ONLY server validates
  playCard(playerId, card) {
    // Comprehensive validation before any move processing
    const validationResult = this.validateMove(playerId, card);
    if (!validationResult.success) {
      return validationResult;
    }
    
    const playerHand = this.playerHands[playerId];

    // Handle single card
    if (!Array.isArray(card)) {
      return this.playSingleCard(playerId, card, playerHand);
    }

    // Handle combo
    if (Array.isArray(card)) {
      return this.playCombo(playerId, card, playerHand);
    }

    return { success: false, error: "Invalid card format" };
  }

  // Comprehensive move validation
  validateMove(playerId, card) {
    // 1. Game state validation
    if (!this.started) {
      return { success: false, error: "Game not started" };
    }
    
    if (this.winner) {
      return { success: false, error: "Game is already finished" };
    }
    
    // 2. Player validation
    if (!this.players.includes(playerId)) {
      return { success: false, error: "Player not in game" };
    }
    
    if (this.currentPlayer !== playerId) {
      return { success: false, error: "Not your turn" };
    }
    
    const playerHand = this.playerHands[playerId];
    if (!playerHand || playerHand.length === 0) {
      return { success: false, error: "Player has no cards" };
    }

    // ✅ 3. Rate limiting and anti-cheat validation (improved robustness)
    const now = Date.now();
    
    // Initialize tracking if needed
    if (!this.playerActions[playerId]) {
      this.playerActions[playerId] = [];
    }
    if (!this.suspiciousActivity[playerId]) {
      this.suspiciousActivity[playerId] = 0;
    }
    
    // Clean up old actions (older than 1 second) in a single atomic-like operation
    const recentActions = this.playerActions[playerId].filter(
      actionTime => now - actionTime < 1000
    );
    
    // ✅ Check rate limit BEFORE updating state (prevent partial updates on rejection)
    if (recentActions.length >= 3) {
      // Increment suspicious activity counter
      this.suspiciousActivity[playerId]++;
      logger.logRateLimitViolation(playerId, recentActions.length);
      
      // Ban after too many violations
      if (this.suspiciousActivity[playerId] > 5) {
        logger.logSuspiciousActivity(playerId, 'RATE_LIMIT_EXCEEDED', {
          violations: this.suspiciousActivity[playerId],
          roomId: this.roomId
        });
        return { success: false, error: "Suspicious activity detected - too many rapid actions" };
      }
      
      return { success: false, error: "Please slow down - too many actions" };
    }
    
    // ✅ Only update state after all checks pass (atomic-like operation)
    recentActions.push(now);
    this.playerActions[playerId] = recentActions;

    // 4. Card format validation
    if (!card) {
      return { success: false, error: "No card provided" };
    }

    // 5. Card ownership validation
    if (Array.isArray(card)) {
      // Combo validation
      if (card.length !== 3 && card.length !== 5) {
        return { success: false, error: "Invalid combo size - must be 3 or 5 cards" };
      }
      
      // Check for duplicate cards in combo
      const cardCounts = {};
      for (const comboCard of card) {
        const cardKey = `${comboCard.rank}-${comboCard.suit}`;
        cardCounts[cardKey] = (cardCounts[cardKey] || 0) + 1;
        if (cardCounts[cardKey] > 1) {
          return { success: false, error: "Duplicate cards in combo" };
        }
      }
      
      // Check if all cards in combo are in player's hand
      for (const comboCard of card) {
        const cardInHand = playerHand.find(c => 
          c.rank === comboCard.rank && c.suit === comboCard.suit
        );
        if (!cardInHand) {
          return { success: false, error: "Card not in hand" };
        }
      }
      
      // Validate combo structure
      if (!isCombo(card)) {
        return { success: false, error: "Invalid combo structure" };
      }
      
      // Validate combo play according to game rules
      if (!canPlayCombo(this.leadCard, card, playerHand, this.trumpSuit)) {
        return { success: false, error: "Invalid combo play according to game rules" };
      }
    } else {
      // Single card validation
      const cardInHand = playerHand.find(c => 
        c.rank === card.rank && c.suit === card.suit
      );
      if (!cardInHand) {
        return { success: false, error: "Card not in hand" };
      }
      
      // Validate single card play according to game rules
      if (!canPlayCard(this.leadCard, card, playerHand, this.trumpSuit)) {
        return { success: false, error: "Invalid play according to game rules" };
      }
    }

    return { success: true };
  }

  // Play a single card
  playSingleCard(playerId, card, playerHand) {
    // Find card index (validation already done in validateMove)
    const cardIndex = playerHand.findIndex(c => 
      c.rank === card.rank && c.suit === card.suit
    );

    // Remove card from hand
    const newPlayerHand = [...playerHand];
    newPlayerHand.splice(cardIndex, 1);
    
    // Update game state
    this.playerHands[playerId] = newPlayerHand;
    this.pile = [...this.pile, card];
    this.lastPlay = { ...this.lastPlay, [playerId]: card };

    // Update game statistics
    this.updatePlayStats(playerId, card);

    // Add to log
    this.addLog(`${playerId} played ${this.formatCard(card)}`);

    // Check if this completes a trick
    if (this.leadCard) {
      return this.resolveTrick(playerId, card);
    } else {
      // Player is leading
      this.leadCard = card;
      this.leadPlayer = playerId;
      this.nextTurn();
      return { success: true };
    }
  }

  // Play a combo
  playCombo(playerId, combo, playerHand) {
    // Find card indices (validation already done in validateMove)
    const cardIndices = [];
    for (const card of combo) {
      const index = playerHand.findIndex(c => 
        c.rank === card.rank && c.suit === card.suit
      );
      cardIndices.push(index);
    }

    // Remove cards from hand (in reverse order to maintain indices)
    const newPlayerHand = [...playerHand];
    cardIndices.sort((a, b) => b - a).forEach(index => {
      newPlayerHand.splice(index, 1);
    });

    // Update game state
    this.playerHands[playerId] = newPlayerHand;
    this.pile = [...this.pile, ...combo];
    this.lastPlay = { ...this.lastPlay, [playerId]: combo };

    // Update game statistics for combo
    this.updateComboStats(playerId, combo);

    // Add to log
    this.addLog(`${playerId} played combo (${combo.length} cards)`);

    // Check if this completes a trick
    if (this.leadCard) {
      return this.resolveTrick(playerId, combo);
    } else {
      // Player is leading
      this.leadCard = combo;
      this.leadPlayer = playerId;
      this.nextTurn();
      return { success: true };
    }
  }

  // Resolve a trick
  resolveTrick(respondingPlayerId, responseCard) {
    const leadCard = this.leadCard;
    const leadPlayerId = this.leadPlayer;
    
    // Determine winner using proper game logic
    const responseWins = determineTrickWinner(leadCard, responseCard, this.trumpSuit);
    const winnerId = responseWins ? respondingPlayerId : leadPlayerId;

    // Move all trick cards to dead pile
    this.deadPile = [...this.deadPile, ...this.pile];
    this.pile = [];
    this.leadCard = null;
    this.leadPlayer = null;

    // Update current player to winner
    this.currentPlayer = winnerId;

    // Update trick statistics
    this.gameStats.totalTricks++;
    this.gameStats.tricksWon[winnerId]++;

    // Check for win condition
    const winner = this.checkWinCondition();
    if (winner) {
      this.winner = winner;
      this.gameStats.gameEndTime = new Date();
      this.gameStats.totalGameTime = this.gameStats.gameEndTime - this.gameStats.gameStartTime;
      this.addLog(`🎉 ${winner} wins the game!`);
    } else {
      // Draw cards to maintain hand size
      this.drawCardsToHandSize();
    }

    this.addLog(`${winnerId} won the trick`);

    return { success: true };
  }

  // Check win condition
  checkWinCondition() {
    for (const playerId of this.players) {
      if (this.playerHands[playerId].length === 0) {
        return playerId;
      }
    }
    return null;
  }

  // Draw cards to maintain hand size
  drawCardsToHandSize() {
    const targetSize = 5;
    
    for (const playerId of this.players) {
      const hand = this.playerHands[playerId];
      while (hand.length < targetSize && this.deck.length > 0) {
        const drawnCard = this.deck.pop();
        hand.push(drawnCard);
        
        // Check if trump card was drawn
        if (drawnCard.rank === this.trumpCard.rank && drawnCard.suit === this.trumpCard.suit) {
          this.trumpCardDrawn = true;
          this.addLog(`${playerId} drew ${this.formatCard(drawnCard)} - 5-card combos are now allowed!`);
        }
      }
    }
  }

  // Next turn after a valid play
  nextTurn() {
    const currentIdx = this.players.indexOf(this.currentPlayer);
    const nextIdx = (currentIdx + 1) % this.players.length;
    this.currentPlayer = this.players[nextIdx];
  }

  // Pick up pile
  pickupPile(playerId) {
    // Comprehensive validation for pickup
    if (!this.started) {
      return { success: false, error: "Game not started" };
    }

    if (this.winner) {
      return { success: false, error: "Game is already finished" };
    }

    if (!this.players.includes(playerId)) {
      return { success: false, error: "Player not in game" };
    }

    if (this.currentPlayer !== playerId) {
      return { success: false, error: "Not your turn" };
    }

    if (!this.leadCard) {
      return { success: false, error: "No pile to pick up" };
    }

    // Additional validation: can't pickup if you have no cards (shouldn't happen but safety check)
    const playerHand = this.playerHands[playerId];
    if (!playerHand || playerHand.length === 0) {
      return { success: false, error: "Player has no cards to play" };
    }

    // Add pile to player's hand
    const pileCards = [...this.pile];
    const newHand = [...this.playerHands[playerId], ...pileCards];
    this.playerHands[playerId] = newHand;
    this.pile = [];
    this.leadCard = null;
    this.leadPlayer = null;

    // Update pickup statistics
    this.gameStats.pilePickups[playerId]++;

    this.addLog(`${playerId} picked up ${pileCards.length} cards`);

    // Draw cards to maintain hand size for all players
    this.drawCardsToHandSize();

    // Move to next player
    this.nextTurn();

    return { success: true };
  }

  // Update statistics for single card play
  updatePlayStats(playerId, card) {
    this.gameStats.cardsPlayed[playerId]++;
    
    // Check if it's a joker
    if (card.rank === 'BJ' || card.rank === 'RJ') {
      this.gameStats.jokersPlayed[playerId]++;
    }
    
    // Check if it's a trump card
    if (isTrump(card, this.trumpSuit)) {
      this.gameStats.trumpCardsPlayed[playerId]++;
    }
  }

  // Update statistics for combo play
  updateComboStats(playerId, combo) {
    this.gameStats.combosPlayed[playerId]++;
    this.gameStats.cardsPlayed[playerId] += combo.length;
    
    // Count jokers and trump cards in combo
    combo.forEach(card => {
      if (card.rank === 'BJ' || card.rank === 'RJ') {
        this.gameStats.jokersPlayed[playerId]++;
      }
      if (isTrump(card, this.trumpSuit)) {
        this.gameStats.trumpCardsPlayed[playerId]++;
      }
    });
  }

  // Get player data for UI helpers
  getPlayerData() {
    const playerData = {};
    for (const playerId of this.players) {
      playerData[playerId] = {
        handSize: this.playerHands[playerId]?.length || 0,
        tricksWon: this.gameStats.tricksWon[playerId] || 0,
        cardsPlayed: this.gameStats.cardsPlayed[playerId] || 0,
        combosPlayed: this.gameStats.combosPlayed[playerId] || 0,
        pilePickups: this.gameStats.pilePickups[playerId] || 0,
        isCurrentPlayer: this.currentPlayer === playerId,
        isRoomOwner: this.roomOwner === playerId
      };
    }
    return playerData;
  }

  // Get comprehensive game statistics
  getGameStats() {
    return {
      ...this.gameStats,
      averageTricksPerPlayer: this.gameStats.totalTricks / this.players.length,
      mostTricksWon: Math.max(...Object.values(this.gameStats.tricksWon)),
      mostCardsPlayed: Math.max(...Object.values(this.gameStats.cardsPlayed)),
      mostCombosPlayed: Math.max(...Object.values(this.gameStats.combosPlayed)),
      totalJokersPlayed: Object.values(this.gameStats.jokersPlayed).reduce((a, b) => a + b, 0),
      totalTrumpCardsPlayed: Object.values(this.gameStats.trumpCardsPlayed).reduce((a, b) => a + b, 0),
      totalPilePickups: Object.values(this.gameStats.pilePickups).reduce((a, b) => a + b, 0)
    };
  }

  // Format card for display
  formatCard(card) {
    if (!card) return '';
    if (card.rank === 'BJ') return 'Joker♣♠';
    if (card.rank === 'RJ') return 'Joker♥♦';
    const suitIcon = this.getSuitIcon(card.suit);
    return `${card.rank}${suitIcon}`;
  }

  // Get suit icon
  getSuitIcon(suit) {
    switch (suit) {
      case 'H': return '♥';
      case 'S': return '♠';
      case 'D': return '♦';
      case 'C': return '♣';
      default: return '';
    }
  }

  // Get the authoritative game state - SINGLE SOURCE OF TRUTH
  getState() {
    return {
      // --- Core metadata ---
      roomId: this.roomId,
      roomOwner: this.roomOwner,
      createdAt: this.createdAt,
      updatedAt: new Date(),

      // --- Game flow ---
      started: this.started,
      currentPlayer: this.currentPlayer,
      winner: this.winner,

      // --- Players & cards ---
      players: this.players.map(id => ({
        id,
        cardCount: this.playerHands[id]?.length || 0
      })),
      playerHands: this.playerHands,
      playerData: this.getPlayerData(),
      deckCount: this.deck.length,
      discardCount: this.deadPile.length,

      // --- Game state ---
      leadPlayer: this.leadPlayer,
      leadCard: this.leadCard,
      pile: this.pile,
      trumpSuit: this.trumpSuit,
      trumpCard: this.trumpCard,
      trumpCardDrawn: this.trumpCardDrawn,
      lastPlay: this.lastPlay,

      // --- UI helpers ---
      playerCount: this.players.length,
      gameStarted: this.started,     // 👈 alias for client backward-compatibility
      canStart: !this.started && this.players.length >= 2,

      // --- Logs / events ---
      logs: this.log.slice(-20),    // send only recent logs
      log: this.log,                // backward compatibility

      // --- Game statistics ---
      gameStats: this.getGameStats()
    };
  }

  // Get public state (without revealing other players' hands)
  getPublicState(playerId) {
    // ✅ DEBUG: Log playerId matching
    const playerHasHand = this.playerHands[playerId] !== undefined;
    const handLength = this.playerHands[playerId]?.length || 0;
    
    console.log(`🔍 getPublicState called for playerId: ${playerId}`, {
      playerId,
      playersInGame: this.players,
      playerHandsKeys: Object.keys(this.playerHands),
      playerInPlayers: this.players.includes(playerId),
      playerHasHand,
      handLength,
      playerHandsValue: this.playerHands[playerId]
    });
    
    const state = this.getState();
    const hand = Array.isArray(this.playerHands[playerId]) ? this.playerHands[playerId] : [];
    
    // ✅ DEBUG: Log what we're returning
    console.log(`🔍 getPublicState returning for ${playerId}:`, {
      handLength: hand.length,
      handIsArray: Array.isArray(hand),
      playerHandsKeys: Object.keys({ [playerId]: hand }),
      handSample: hand.slice(0, 2) // Show first 2 cards for debugging
    });
    
    // ✅ FIX: Build publicState explicitly to ensure hand and playerHands are included
    // Don't rely on spread operator which might not override correctly
    const publicState = {
      ...state,
      // Recompute public-friendly aggregates explicitly
      players: this.players.map(id => ({
        id,
        cardCount: this.playerHands[id]?.length || 0
      })),
      deckCount: this.deck.length,
      discardCount: this.deadPile.length,
      logs: this.log.slice(-20),
      // ✅ CRITICAL: Explicitly set hand and playerHands AFTER spread to ensure they're included
      hand: hand,
      // Backward compatibility: scoped playerHands map
      playerHands: {
        [playerId]: hand
      }
    };
    
    // ✅ VERIFY: Double-check that hand and playerHands are set
    if (!publicState.hand || publicState.hand.length === 0) {
      console.error(`❌ ERROR: publicState.hand is empty for playerId ${playerId}!`, {
        hand,
        playerHands: this.playerHands[playerId],
        playerHandsKeys: Object.keys(this.playerHands)
      });
    }
    
    if (!publicState.playerHands || !publicState.playerHands[playerId]) {
      console.error(`❌ ERROR: publicState.playerHands[${playerId}] is missing!`, {
        publicStatePlayerHands: publicState.playerHands,
        hand
      });
    }
    
    return publicState;
  }

  // Get player's private state (their hand only) - DEPRECATED, use getPublicState
  getPlayerState(playerId) {
    return this.getPublicState(playerId);
  }

  // Deal cards to a new player who joins an ongoing game
  dealCardsToNewPlayer(playerId) {
    if (!this.started) {
      return { success: false, error: "Game not started" };
    }

    if (this.playerHands[playerId] && this.playerHands[playerId].length > 0) {
      return { success: false, error: "Player already has cards" };
    }

    // Initialize empty hand
    this.playerHands[playerId] = [];

    // Deal 5 cards to the new player
    const cardsToDeal = 5;
    for (let i = 0; i < cardsToDeal && this.deck.length > 0; i++) {
      const card = this.deck.pop();
      this.playerHands[playerId].push(card);
      
      // Check if trump card was drawn
      if (card.rank === this.trumpCard.rank && card.suit === this.trumpCard.suit) {
        this.trumpCardDrawn = true;
        this.addLog(`${playerId} drew ${this.formatCard(card)} - 5-card combos are now allowed!`);
      }
    }

    this.addLog(`Cards dealt to new player ${playerId}`);
    return { success: true };
  }

  // Force deal cards to all players (room owner only)
  forceDealCards() {
    if (!this.started) {
      return { success: false, error: "Game not started" };
    }

    // Deal cards to all players who don't have cards
    for (const playerId of this.players) {
      if (!this.playerHands[playerId] || this.playerHands[playerId].length === 0) {
        const result = this.dealCardsToNewPlayer(playerId);
        if (!result.success) {
          return result;
        }
      }
    }

    this.addLog(`Cards force-dealt to all players`);
    return { success: true };
  }
}

module.exports = { GameState };