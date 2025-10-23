// Game constants for Huzur

// Hand and deck configuration
export const HAND_SIZE = 5;
export const SUITS = ['H', 'S', 'D', 'C'];
export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', '3', '2', 'A'];

// Combo sizes
export const COMBO_SIZES = {
  SMALL: 3,  // pair + 1 card
  LARGE: 5   // 2 pairs + 1 card
};

// Card power values for bot AI
export const CARD_POWER = {
  JOKER: 100,
  BASE_RANK_MULTIPLIER: 10
};

// UI delays (in milliseconds)
export const DELAYS = {
  BOT_TURN: 600,
  BOT_THINKING: 300
};

// Bot difficulty levels with enhanced trump conservation
export const DIFFICULTY_LEVELS = {
  EASY: {
    name: 'Easy',
    trumpConservation: 0.9,    // Very conservative with trumps - save for endgame
    comboAggression: 0.3,      // Rarely plays combos
    prediction: false,         // No opponent hand prediction
    bluffing: false,           // No bluffing
    endgameAggression: 0.6     // Moderate endgame aggression
  },
  MEDIUM: {
    name: 'Medium',
    trumpConservation: 0.6,    // More conservative trump usage - better endgame play
    comboAggression: 0.6,      // Moderate combo usage
    prediction: true,          // Basic opponent hand prediction
    bluffing: false,           // No bluffing
    endgameAggression: 0.8     // Higher endgame aggression
  },
  HARD: {
    name: 'Hard',
    trumpConservation: 0.3,    // Balanced trump usage with endgame focus
    comboAggression: 0.9,      // Frequent combo usage
    prediction: true,          // Advanced opponent hand prediction
    bluffing: false,           // No bluffing yet
    endgameAggression: 0.9     // Very aggressive endgame
  },
  EXPERT: {
    name: 'Expert',
    trumpConservation: 0.2,    // Strategic trump usage - aggressive when needed
    comboAggression: 1.0,      // Always looks for combos
    prediction: true,          // Full opponent hand prediction
    bluffing: true,            // Includes bluffing
    endgameAggression: 1.0     // Maximum endgame aggression
  }
};

