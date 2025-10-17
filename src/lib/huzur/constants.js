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

