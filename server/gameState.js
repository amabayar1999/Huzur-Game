// Import Huzur game logic (we'll need to adapt this for server-side)
// For now, we'll create a server-compatible version

class GameState {
  constructor() {
    this.players = [];
    this.gameStarted = false;
    this.currentPlayer = null;
    this.leadCard = null;
    this.pile = [];
    this.deck = [];
    this.trumpSuit = null;
    this.trumpCard = null;
    this.trumpCardDrawn = false;
    this.playerHands = {}; // playerId -> cards[]
    this.deadPile = [];
    this.winner = null;
    this.log = [];
    this.lastPlay = {};
    this.createdAt = new Date();
  }

  addPlayer(playerId) {
    if (!this.players.includes(playerId)) {
      this.players.push(playerId);
      this.playerHands[playerId] = [];
      
      // Set first player as current player if game hasn't started
      if (!this.currentPlayer && this.players.length === 1) {
        this.currentPlayer = playerId;
      }
    }
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p !== playerId);
    delete this.playerHands[playerId];
    
    // If removed player was current player, move to next player
    if (this.currentPlayer === playerId) {
      this.currentPlayer = this.players[0] || null;
    }
    
    // If no players left, reset game
    if (this.players.length === 0) {
      this.gameStarted = false;
      this.currentPlayer = null;
      this.leadCard = null;
      this.pile = [];
      this.winner = null;
    }
  }

  startGame() {
    if (this.players.length < 2) {
      return { success: false, error: "Need at least 2 players to start" };
    }
    
    this.gameStarted = true;
    this.currentPlayer = this.players[0];
    
    // Initialize Huzur game
    this.initializeHuzurGame();
    
    this.log.push(`Game started with ${this.players.length} players`);
    
    return { success: true, gameState: this.getState() };
  }

  // Initialize Huzur game with proper deck and card dealing
  initializeHuzurGame() {
    // Create a standard 54-card deck (52 + 2 jokers)
    this.deck = this.createDeck();
    this.shuffleDeck();
    
    // Set trump card (bottom card of deck)
    this.trumpCard = this.deck[0];
    this.trumpSuit = this.getTrumpSuit(this.trumpCard);
    this.trumpCardDrawn = false;
    
    // Deal 5 cards to each player
    this.dealCards();
    
    this.log.push(`Trump is ${this.trumpSuit} from ${this.formatCard(this.trumpCard)}`);
    this.log.push(`5-card combos will be unlocked when the trump card is drawn!`);
  }

  // Create standard deck
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

  // Deal cards to players
  dealCards() {
    const cardsPerPlayer = 5;
    
    for (let i = 0; i < cardsPerPlayer; i++) {
      for (const playerId of this.players) {
        if (this.deck.length > 0) {
          this.playerHands[playerId].push(this.deck.pop());
        }
      }
    }
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

  playCard(playerId, card) {
    if (!this.gameStarted) {
      return { success: false, error: "Game not started" };
    }
    
    if (this.currentPlayer !== playerId) {
      return { success: false, error: "Not your turn" };
    }
    
    const playerHand = this.playerHands[playerId];
    if (!playerHand) {
      return { success: false, error: "Player not found" };
    }

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

  // Play a single card
  playSingleCard(playerId, card, playerHand) {
    // Validate card is in hand
    const cardIndex = playerHand.findIndex(c => 
      c.rank === card.rank && c.suit === card.suit
    );
    
    if (cardIndex === -1) {
      return { success: false, error: "Card not in hand" };
    }

    // Remove card from hand
    const newPlayerHand = [...playerHand];
    newPlayerHand.splice(cardIndex, 1);
    
    // Update game state
    this.playerHands[playerId] = newPlayerHand;
    this.pile = [...this.pile, card];
    this.lastPlay = { ...this.lastPlay, [playerId]: card };

    // Add to log
    this.log.push(`${playerId} played ${this.formatCard(card)}`);

    // Check if this completes a trick
    if (this.leadCard) {
      return this.resolveTrick(playerId, card);
    } else {
      // Player is leading
      this.leadCard = card;
      this.nextPlayer();
      return { success: true, gameState: this.getState() };
    }
  }

  // Play a combo
  playCombo(playerId, combo, playerHand) {
    // Validate all cards are in hand
    const cardIndices = [];
    for (const card of combo) {
      const index = playerHand.findIndex(c => 
        c.rank === card.rank && c.suit === card.suit
      );
      if (index === -1) {
        return { success: false, error: "Card not in hand" };
      }
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

    // Add to log
    this.log.push(`${playerId} played combo (${combo.length} cards)`);

    // Check if this completes a trick
    if (this.leadCard) {
      return this.resolveTrick(playerId, combo);
    } else {
      // Player is leading
      this.leadCard = combo;
      this.nextPlayer();
      return { success: true, gameState: this.getState() };
    }
  }

  // Resolve a trick
  resolveTrick(respondingPlayerId, responseCard) {
    const leadCard = this.leadCard;
    const leadPlayerId = this.currentPlayer;
    
    // Determine winner (simplified logic for now)
    const responseWins = this.determineTrickWinner(leadCard, responseCard);
    const winnerId = responseWins ? respondingPlayerId : leadPlayerId;

    // Move cards to dead pile
    this.deadPile = [...this.deadPile, ...this.pile];
    this.pile = [];
    this.leadCard = null;

    // Update current player to winner
    this.currentPlayer = winnerId;

    // Check for win condition
    const winner = this.checkWinCondition();
    if (winner) {
      this.winner = winner;
      this.log.push(`🎉 ${winner} wins the game!`);
    } else {
      // Draw cards to maintain hand size
      this.drawCardsToHandSize();
    }

    this.log.push(`${winnerId} won the trick`);

    return { success: true, gameState: this.getState() };
  }

  // Determine trick winner (simplified)
  determineTrickWinner(leadCard, responseCard) {
    // This is simplified - in a full implementation, you'd use your existing game logic
    if (Array.isArray(leadCard) && Array.isArray(responseCard)) {
      return responseCard.length >= leadCard.length;
    } else if (!Array.isArray(leadCard) && !Array.isArray(responseCard)) {
      return this.compareCards(leadCard, responseCard);
    }
    
    return Array.isArray(responseCard);
  }

  // Compare cards (simplified)
  compareCards(lead, response) {
    // Simplified comparison - you'd use your existing canBeat logic
    const rankOrder = ['7', '8', '9', '10', 'J', 'Q', 'K', '3', '2', 'A'];
    const leadIndex = rankOrder.indexOf(lead.rank);
    const responseIndex = rankOrder.indexOf(response.rank);
    
    return responseIndex > leadIndex;
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
          this.log.push(`${playerId} drew ${this.formatCard(drawnCard)} - 5-card combos are now allowed!`);
        }
      }
    }
  }

  // Move to next player
  nextPlayer() {
    const currentIndex = this.players.indexOf(this.currentPlayer);
    const nextIndex = (currentIndex + 1) % this.players.length;
    this.currentPlayer = this.players[nextIndex];
  }

  // Pick up pile
  pickupPile(playerId) {
    if (!this.gameStarted) {
      return { success: false, error: "Game not started" };
    }

    if (this.currentPlayer !== playerId) {
      return { success: false, error: "Not your turn" };
    }

    if (!this.leadCard) {
      return { success: false, error: "No pile to pick up" };
    }

    // Add pile to player's hand
    const newHand = [...this.playerHands[playerId], ...this.pile];
    this.playerHands[playerId] = newHand;
    this.pile = [];
    this.leadCard = null;

    this.log.push(`${playerId} picked up ${this.pile.length} cards`);

    // Move to next player
    this.nextPlayer();

    return { success: true, gameState: this.getState() };
  }

  getState() {
    return {
      players: this.players,
      gameStarted: this.gameStarted,
      currentPlayer: this.currentPlayer,
      leadCard: this.leadCard,
      pile: this.pile,
      deck: this.deck,
      trumpSuit: this.trumpSuit,
      trumpCard: this.trumpCard,
      trumpCardDrawn: this.trumpCardDrawn,
      playerHands: this.playerHands,
      deadPile: this.deadPile,
      winner: this.winner,
      log: this.log,
      lastPlay: this.lastPlay,
      createdAt: this.createdAt
    };
  }

  // Get public state (without revealing other players' hands)
  getPublicState(playerId) {
    const state = this.getState();
    const publicState = { ...state };
    
    // Only show current player's hand
    publicState.playerHands = {};
    if (this.playerHands[playerId]) {
      publicState.playerHands[playerId] = this.playerHands[playerId];
    }
    
    return publicState;
  }
}

module.exports = { GameState };
