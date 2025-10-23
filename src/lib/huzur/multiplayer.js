// Multiplayer game logic that integrates with existing Huzur game system
import { gameReducer, initGame } from './gameReducer';
import { canPlayCard, canPlayCombo, isCombo, formatCard } from './cards';
import { COMBO_SIZES } from './constants';

// Multiplayer game state manager
export class MultiplayerGameState {
  constructor(roomId, players) {
    this.roomId = roomId;
    this.players = players;
    this.gameState = null;
    this.gameStarted = false;
    this.currentPlayerIndex = 0;
    this.spectators = [];
    this.log = [];
    this.createdAt = new Date();
  }

  // Initialize game with proper deck dealing
  initializeGame() {
    if (this.players.length < 2) {
      return { success: false, error: "Need at least 2 players to start" };
    }

    // Initialize game state using existing initGame function
    this.gameState = initGame();
    
    // Convert single-player state to multiplayer format
    this.gameState = {
      ...this.gameState,
      players: this.players,
      currentPlayer: this.players[0],
      playerHands: this.distributeCards(),
      gameStarted: true,
      roomId: this.roomId,
      spectators: this.spectators
    };

    this.gameStarted = true;
    this.currentPlayerIndex = 0;
    
    this.log.push(`Game started with ${this.players.length} players`);
    this.log.push(`Trump is ${this.gameState.trumpSuit} from ${formatCard(this.gameState.trumpCard)}`);
    
    return { success: true, gameState: this.getPublicState() };
  }

  // Distribute cards to players
  distributeCards() {
    const playerHands = {};
    const deck = [...this.gameState.deck];
    
    // Deal 5 cards to each player
    this.players.forEach(playerId => {
      playerHands[playerId] = [];
      for (let i = 0; i < 5; i++) {
        if (deck.length > 0) {
          playerHands[playerId].push(deck.pop());
        }
      }
    });

    // Update deck
    this.gameState.deck = deck;
    
    return playerHands;
  }

  // Play a card (single or combo)
  playCard(playerId, cardOrCombo) {
    if (!this.gameStarted || !this.gameState) {
      return { success: false, error: "Game not started" };
    }

    if (this.gameState.currentPlayer !== playerId) {
      return { success: false, error: "Not your turn" };
    }

    const playerHand = this.gameState.playerHands[playerId];
    if (!playerHand) {
      return { success: false, error: "Player not found" };
    }

    // Handle single card
    if (!Array.isArray(cardOrCombo)) {
      return this.playSingleCard(playerId, cardOrCombo, playerHand);
    }

    // Handle combo
    if (Array.isArray(cardOrCombo)) {
      return this.playCombo(playerId, cardOrCombo, playerHand);
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

    // Validate play using existing game logic
    if (!canPlayCard(this.gameState.leadCard, card, playerHand, this.gameState.trumpSuit)) {
      return { success: false, error: "Invalid play" };
    }

    // Remove card from hand
    const newPlayerHand = [...playerHand];
    newPlayerHand.splice(cardIndex, 1);
    
    // Update game state
    this.gameState.playerHands[playerId] = newPlayerHand;
    this.gameState.pile = [...this.gameState.pile, card];
    this.gameState.lastPlay = { ...this.gameState.lastPlay, [playerId]: card };

    // Add to log
    this.log.push(`${playerId} played ${formatCard(card)}`);

    // Check if this completes a trick
    if (this.gameState.leadCard) {
      return this.resolveTrick(playerId, card);
    } else {
      // Player is leading
      this.gameState.leadCard = card;
      this.nextPlayer();
      return { success: true, gameState: this.getPublicState() };
    }
  }

  // Play a combo
  playCombo(playerId, combo, playerHand) {
    // Validate combo size
    if (combo.length !== COMBO_SIZES.SMALL && combo.length !== COMBO_SIZES.LARGE) {
      return { success: false, error: "Invalid combo size" };
    }

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

    // Validate combo play using existing game logic
    if (!canPlayCombo(this.gameState.leadCard, combo, playerHand, this.gameState.trumpSuit)) {
      return { success: false, error: "Invalid combo play" };
    }

    // Remove cards from hand (in reverse order to maintain indices)
    const newPlayerHand = [...playerHand];
    cardIndices.sort((a, b) => b - a).forEach(index => {
      newPlayerHand.splice(index, 1);
    });

    // Update game state
    this.gameState.playerHands[playerId] = newPlayerHand;
    this.gameState.pile = [...this.gameState.pile, ...combo];
    this.gameState.lastPlay = { ...this.gameState.lastPlay, [playerId]: combo };

    // Add to log
    this.log.push(`${playerId} played combo (${combo.length} cards)`);

    // Check if this completes a trick
    if (this.gameState.leadCard) {
      return this.resolveTrick(playerId, combo);
    } else {
      // Player is leading
      this.gameState.leadCard = combo;
      this.nextPlayer();
      return { success: true, gameState: this.getPublicState() };
    }
  }

  // Resolve a trick (when all players have played)
  resolveTrick(respondingPlayerId, responseCard) {
    const leadCard = this.gameState.leadCard;
    const leadPlayerId = this.gameState.currentPlayer;
    
    // Determine winner using existing game logic
    const responseWins = this.determineTrickWinner(leadCard, responseCard);
    const winnerId = responseWins ? respondingPlayerId : leadPlayerId;

    // Move cards to dead pile
    this.gameState.deadPile = [...this.gameState.deadPile, ...this.gameState.pile];
    this.gameState.pile = [];
    this.gameState.leadCard = null;

    // Update current player to winner
    this.gameState.currentPlayer = winnerId;
    this.currentPlayerIndex = this.players.indexOf(winnerId);

    // Check for win condition
    const winner = this.checkWinCondition();
    if (winner) {
      this.gameState.winner = winner;
      this.log.push(`🎉 ${winner} wins the game!`);
    } else {
      // Draw cards to maintain hand size
      this.drawCardsToHandSize();
    }

    this.log.push(`${winnerId} won the trick`);

    return { success: true, gameState: this.getPublicState() };
  }

  // Determine trick winner using existing game logic
  determineTrickWinner(leadCard, responseCard) {
    // Import the existing logic from gameReducer
    // This is a simplified version - you might want to import the full logic
    if (Array.isArray(leadCard) && Array.isArray(responseCard)) {
      // Combo vs combo - use existing combo comparison logic
      return this.compareCombos(leadCard, responseCard);
    } else if (!Array.isArray(leadCard) && !Array.isArray(responseCard)) {
      // Single card vs single card
      return this.compareSingleCards(leadCard, responseCard);
    }
    
    // Mixed cases - combos generally beat single cards
    return Array.isArray(responseCard);
  }

  // Compare single cards (simplified version)
  compareSingleCards(lead, response) {
    // This should use your existing canBeat function
    // For now, using a simplified comparison
    return response.rank > lead.rank || 
           (response.rank === lead.rank && response.suit !== lead.suit);
  }

  // Compare combos (simplified version)
  compareCombos(leadCombo, responseCombo) {
    // This should use your existing combo comparison logic
    // For now, using a simplified comparison
    return responseCombo.length >= leadCombo.length;
  }

  // Check win condition
  checkWinCondition() {
    for (const playerId of this.players) {
      if (this.gameState.playerHands[playerId].length === 0) {
        return playerId;
      }
    }
    return null;
  }

  // Draw cards to maintain hand size
  drawCardsToHandSize() {
    const targetSize = 5;
    
    for (const playerId of this.players) {
      const hand = this.gameState.playerHands[playerId];
      while (hand.length < targetSize && this.gameState.deck.length > 0) {
        hand.push(this.gameState.deck.pop());
      }
    }
  }

  // Move to next player
  nextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.gameState.currentPlayer = this.players[this.currentPlayerIndex];
  }

  // Pick up pile
  pickupPile(playerId) {
    if (!this.gameStarted || !this.gameState) {
      return { success: false, error: "Game not started" };
    }

    if (this.gameState.currentPlayer !== playerId) {
      return { success: false, error: "Not your turn" };
    }

    if (!this.gameState.leadCard) {
      return { success: false, error: "No pile to pick up" };
    }

    // Add pile to player's hand
    const newHand = [...this.gameState.playerHands[playerId], ...this.gameState.pile];
    this.gameState.playerHands[playerId] = newHand;
    this.gameState.pile = [];
    this.gameState.leadCard = null;

    this.log.push(`${playerId} picked up ${this.gameState.pile.length} cards`);

    // Move to next player
    this.nextPlayer();

    return { success: true, gameState: this.getPublicState() };
  }

  // Get public state (hiding other players' hands)
  getPublicState() {
    const publicState = {
      ...this.gameState,
      playerHands: {} // Hide hands from other players
    };

    return publicState;
  }

  // Get state for specific player (showing only their hand)
  getPlayerState(playerId) {
    const playerState = {
      ...this.gameState,
      playerHands: {
        [playerId]: this.gameState.playerHands[playerId] || []
      }
    };

    return playerState;
  }

  // Add spectator
  addSpectator(spectatorId) {
    if (!this.spectators.includes(spectatorId)) {
      this.spectators.push(spectatorId);
    }
  }

  // Remove spectator
  removeSpectator(spectatorId) {
    this.spectators = this.spectators.filter(id => id !== spectatorId);
  }
}

// Helper function to create multiplayer game state
export function createMultiplayerGame(roomId, players) {
  return new MultiplayerGameState(roomId, players);
}
