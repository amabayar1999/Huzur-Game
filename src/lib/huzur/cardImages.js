// Utility functions for mapping card data to image sources

/**
 * Maps card rank to the format expected by card image services
 */
export const getCardImagePath = (card) => {
  if (!card) return null;
  
  // Handle jokers - using reliable image sources
  if (card.rank === 'BJ') {
    return 'https://deckofcardsapi.com/static/img/black_joker.png';
  }
  if (card.rank === 'RJ') {
    return 'https://deckofcardsapi.com/static/img/red_joker.png';
  }
  
  // Map suit to full names
  const suitMap = {
    'H': 'hearts',
    'S': 'spades', 
    'D': 'diamonds',
    'C': 'clubs'
  };
  
  // Map rank to expected format
  const rankMap = {
    'A': 'ace',
    'K': 'king',
    'Q': 'queen', 
    'J': 'jack',
    '10': '10',
    '9': '9',
    '8': '8',
    '7': '7',
    '6': '6',
    '5': '5',
    '4': '4',
    '3': '3',
    '2': '2'
  };
  
  const suit = suitMap[card.suit];
  const rank = rankMap[card.rank];
  
  if (!suit || !rank) {
    console.warn('Invalid card data:', card);
    return null;
  }
  
  // Use Deck of Cards API for card images
  return `https://deckofcardsapi.com/static/img/${rank}_of_${suit}.png`;
};

/**
 * Alternative: Use a different card image service
 */
export const getCardImagePathAlternative = (card) => {
  if (!card) return null;
  
  // Handle jokers
  if (card.rank === 'BJ') {
    return 'https://www.deckofcardsapi.com/static/img/black_joker.png';
  }
  if (card.rank === 'RJ') {
    return 'https://www.deckofcardsapi.com/static/img/red_joker.png';
  }
  
  // Map suit to full names
  const suitMap = {
    'H': 'hearts',
    'S': 'spades', 
    'D': 'diamonds',
    'C': 'clubs'
  };
  
  // Map rank to expected format
  const rankMap = {
    'A': 'ace',
    'K': 'king',
    'Q': 'queen', 
    'J': 'jack',
    '10': '10',
    '9': '9',
    '8': '8',
    '7': '7',
    '6': '6',
    '5': '5',
    '4': '4',
    '3': '3',
    '2': '2'
  };
  
  const suit = suitMap[card.suit];
  const rank = rankMap[card.rank];
  
  if (!suit || !rank) {
    console.warn('Invalid card data:', card);
    return null;
  }
  
  // Use alternative service
  return `https://www.deckofcardsapi.com/static/img/${rank}_of_${suit}.png`;
};

/**
 * Get card back image for face-down cards
 */
export const getCardBackImage = () => {
  return 'https://deckofcardsapi.com/static/img/back.png';
};

/**
 * Get alternative joker image sources as fallbacks
 */
export const getJokerImageFallbacks = (card) => {
  if (card.rank === 'BJ') {
    return [
      'https://deckofcardsapi.com/static/img/black_joker.png',
      'https://www.deckofcardsapi.com/static/img/black_joker.png'
    ];
  }
  if (card.rank === 'RJ') {
    return [
      'https://deckofcardsapi.com/static/img/red_joker.png',
      'https://www.deckofcardsapi.com/static/img/red_joker.png'
    ];
  }
  return [];
};

/**
 * Check if we should use images or fallback to text
 */
export const shouldUseImages = () => {
  // Enable images for jokers, disable for other cards due to CORS/availability issues
  return true;
};

/**
 * Check if we should use images for a specific card
 */
export const shouldUseImageForCard = (card) => {
  if (!card) return false;
  
  // Use text-based rendering for jokers (more reliable)
  if (card.rank === 'BJ' || card.rank === 'RJ') {
    return false;
  }
  
  // For other cards, use text-based rendering for now
  return false;
};

/**
 * Get enhanced text-based card representation
 */
export const getCardTextRepresentation = (card) => {
  if (!card) return null;
  
  // Handle jokers
  if (card.rank === 'BJ') {
    return {
      rank: 'J',
      suit: '♠',
      color: 'black',
      isJoker: true,
      centerText: 'JOKER'
    };
  }
  if (card.rank === 'RJ') {
    return {
      rank: 'J',
      suit: '♥',
      color: 'red',
      isJoker: true,
      centerText: 'JOKER'
    };
  }
  
  const suitSymbols = {
    'H': '♥',
    'S': '♠', 
    'D': '♦',
    'C': '♣'
  };
  
  const suitColors = {
    'H': 'red',
    'S': 'black',
    'D': 'red', 
    'C': 'black'
  };
  
  return {
    rank: card.rank,
    suit: suitSymbols[card.suit],
    color: suitColors[card.suit],
    isJoker: false,
    centerText: suitSymbols[card.suit]
  };
};
