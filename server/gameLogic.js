// Server-side Huzur game logic
// Complete implementation of all game rules and validation logic

// Constants (matching client-side)
const SUITS = ['H', 'S', 'D', 'C'];
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', '3', '2', 'A'];
const COMBO_SIZES = {
  SMALL: 3,  // pair + 1 card
  LARGE: 5   // 2 pairs + 1 card
};

// Helper functions
function isJoker(card) {
  return card && (card.rank === 'BJ' || card.rank === 'RJ');
}

function isTrump(card, trumpSuit) {
  if (!card) return false;
  if (isJoker(card)) return true;
  return card.suit === trumpSuit;
}

function jokerToTrumpSuit(card) {
  if (!card) return null;
  if (card.rank === 'BJ') return 'S';
  if (card.rank === 'RJ') return 'H';
  return null;
}

// Rank order for comparison
const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', '3', '2', 'A'];

function compareWithinSameSuit(a, b) {
  const ai = RANK_ORDER.indexOf(a.rank);
  const bi = RANK_ORDER.indexOf(b.rank);
  if (ai < bi) return -1;
  if (ai > bi) return 1;
  return 0;
}

function compareCards(a, b, trumpSuit) {
  // Returns -1 if a<b, 0 if equal, 1 if a>b according to game power
  if (isJoker(a) && isJoker(b)) {
    if (a.rank === b.rank) return 0;
    return a.rank === 'RJ' ? 1 : -1; // RJ beats BJ
  }
  if (isJoker(a)) return 1;
  if (isJoker(b)) return -1;

  const aTrump = isTrump(a, trumpSuit);
  const bTrump = isTrump(b, trumpSuit);
  if (aTrump && bTrump) {
    return compareWithinSameSuit(a, b);
  }
  if (aTrump && !bTrump) return 1;
  if (!aTrump && bTrump) return -1;

  // Neither trump: only comparable within same suit
  if (a.suit === b.suit) {
    return compareWithinSameSuit(a, b);
  }
  // Different non-trump suits are incomparable in power; treat as equal
  return 0;
}

function canBeat(lead, response, trumpSuit) {
  if (!lead || !response) return false;
  
  // Handle joker vs joker comparison
  if (isJoker(lead) && isJoker(response)) {
    return compareCards(lead, response, trumpSuit) < 0;
  }
  
  // Jokers always beat non-jokers
  if (isJoker(response)) return true;
  if (isJoker(lead)) return false;

  const leadTrump = isTrump(lead, trumpSuit);
  const respTrump = isTrump(response, trumpSuit);

  if (leadTrump && respTrump) {
    return compareWithinSameSuit(lead, response) < 0;
  }
  if (leadTrump && !respTrump) return false;
  if (!leadTrump && respTrump) return true;
  if (lead.suit === response.suit) {
    return compareWithinSameSuit(lead, response) < 0;
  }
  return false;
}

function mustFollowSuit(leadCard, hand) {
  if (!leadCard || isJoker(leadCard)) return false;
  return hand.some(card => card.suit === leadCard.suit && !isJoker(card));
}

function hasSuitInHand(hand, suit) {
  return hand.some(card => card.suit === suit && !isJoker(card));
}

function getCardsInSuit(hand, suit) {
  return hand.filter(card => card.suit === suit && !isJoker(card));
}

// Combo detection functions - Relaxed Huzur pairs+1 pattern
function isCombo(cards) {
  if (!cards || (cards.length !== COMBO_SIZES.SMALL && cards.length !== COMBO_SIZES.LARGE)) return false;
  
  // Count regular cards by rank and count jokers separately
  const rankCounts = {};
  let jokerCount = 0;
  
  cards.forEach(card => {
    if (isJoker(card)) {
      jokerCount++;
    } else {
      rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    }
  });
  
  // Get all rank counts as an array
  const rankCountsArray = Object.values(rankCounts);
  
  if (cards.length === COMBO_SIZES.SMALL) {
    // 3 cards: need at least 2 cards of the same rank (allowing triplets)
    // Valid patterns: 2+1, 3 (triplets), or with jokers
    
    // Count how many ranks have 2+ cards
    const pairCount = rankCountsArray.filter(count => count >= 2).length;
    
    // If we have any rank with 2+ cards, it's valid
    if (pairCount >= 1) {
      return true;
    }
    
    // If no natural pairs, try to form one with jokers
    if (jokerCount >= 2) {
      // 2+ jokers can form a pair
      return true;
    }
    
    // 1 joker can only be used as a single card when there's already a natural pair
    if (jokerCount === 1) {
      // For a 3-card combo with 1 joker, we need at least one natural pair
      // The joker can then be the third card (single)
      // This means we need at least 2 cards of the same rank
      const hasNaturalPair = rankCountsArray.some(count => count >= 2);
      if (hasNaturalPair) {
        return true;
      }
    }
    
    return false;
    
  } else if (cards.length === COMBO_SIZES.LARGE) {
    // 5 cards: need at least 4 cards that can form 2 pairs
    // Valid patterns: 2+2+1, 3+2 (triplet+pair), 4+1 (quad+single), etc.
    
    // Count total paired cards (excluding singles and one extra)
    // We need at least 4 cards that can form pairs
    let pairedCards = 0;
    
    // Count cards that are in pairs/triplets/quads
    rankCountsArray.forEach(count => {
      if (count >= 2) {
        // These cards can form at least one pair
        pairedCards += Math.floor(count / 2) * 2; // Count pairs (2, 4, 6...)
      }
    });
    
    // Add jokers to paired cards (2 jokers = 1 pair worth)
    // Only count jokers that can form pairs with other jokers or complete existing pairs
    const jokerPairs = Math.floor(jokerCount / 2) * 2; // Only even numbers of jokers can form pairs
    pairedCards += jokerPairs;
    
    // We need at least 4 cards that can form pairs (2 pairs worth)
    if (pairedCards >= 4) {
      return true;
    }
    
    // Special case: if we have jokers, they can complete pairs more flexibly
    // Count ranks with at least 2 cards
    const pairRanks = rankCountsArray.filter(count => count >= 2).length;
    
    // If we have at least 1 natural pair/triplet/quad
    if (pairRanks >= 1) {
      // For 5-card combos, we need at least 2 pairs total
      // We already have 1 natural pair, so we need 1 more pair
      // This can be formed by:
      // 1. Another natural pair/triplet/quad
      // 2. 2 jokers forming a pair
      // 3. 1 joker completing a single card to form a pair
      
      if (pairRanks >= 2) {
        // We have 2+ natural pairs
        return true;
      }
      
      // Check if we can form a second pair with jokers
      const singles = rankCountsArray.filter(count => count === 1).length;
      
      // Case 1: 2 jokers can form a pair
      if (jokerCount >= 2) {
        return true;
      }
      
      // Case 2: 1 joker can only be used as a single card when we already have 2 natural pairs
      // (Jokers cannot create new pairs with single cards)
      if (jokerCount === 1 && pairRanks >= 2) {
        return true;
      }
    }
    
    // If we have 2+ pairs naturally, it's valid
    if (pairRanks >= 2) {
      return true;
    }
    
    return false;
  }
  
  return false;
}

function canBeatCombo(leadCombo, responseCombo, trumpSuit) {
  if (!isCombo(leadCombo) || !isCombo(responseCombo)) return false;
  
  if (leadCombo.length !== responseCombo.length) return false;
  
  const sortedLead = [...leadCombo].sort((a, b) => compareCards(a, b, trumpSuit));
  const sortedResponse = [...responseCombo].sort((a, b) => compareCards(a, b, trumpSuit));
  
  for (let i = 0; i < sortedLead.length; i++) {
    if (!canBeat(sortedLead[i], sortedResponse[i], trumpSuit)) {
      return false;
    }
  }
  
  return true;
}

function canBeatComboByPosition(leadCombo, responseCards, trumpSuit) {
  if (!Array.isArray(leadCombo) || !Array.isArray(responseCards)) return false;
  if (leadCombo.length !== responseCards.length) return false;
  
  for (let i = 0; i < leadCombo.length; i++) {
    if (!canBeat(leadCombo[i], responseCards[i], trumpSuit)) {
      return false;
    }
  }
  
  return true;
}

function canPlayCombo(leadCombo, responseCards, hand, trumpSuit) {
  if (!leadCombo) return true; // Leading with combo is always allowed
  
  if (isCombo(leadCombo)) {
    if (!responseCards || responseCards.length === 0) {
      return false;
    }
    
    if (leadCombo.length !== responseCards.length) {
      return false;
    }
    
    return canBeatComboByPosition(leadCombo, responseCards, trumpSuit);
  }
  
  if (responseCards && (responseCards.length === COMBO_SIZES.SMALL || responseCards.length === COMBO_SIZES.LARGE)) {
    return responseCards.every(card => canBeat(leadCombo, card, trumpSuit));
  }
  
  return false;
}

// Main validation functions
function canPlayCard(leadCard, card, hand, trumpSuit) {
  if (!leadCard) return true; // Leading is always allowed
  
  // If must follow suit
  if (mustFollowSuit(leadCard, hand)) {
    // Must play same suit, joker, or trump card
    if (card.suit !== leadCard.suit && !isJoker(card) && !isTrump(card, trumpSuit)) {
      return false;
    }
    // If following suit with non-joker, must beat the lead card
    if (card.suit === leadCard.suit && !isJoker(card)) {
      return canBeat(leadCard, card, trumpSuit);
    }
    // Jokers always beat, so they're valid
    if (isJoker(card)) {
      return true;
    }
    // Trump cards can be played if they beat the lead card
    if (isTrump(card, trumpSuit)) {
      return canBeat(leadCard, card, trumpSuit);
    }
    return false;
  }
  
  // Can play off-suit only if the card can beat the lead card
  return canBeat(leadCard, card, trumpSuit);
}

// Helper function to get combo play order (ascending by power)
function getComboPlayOrder(combo, trumpSuit) {
  return [...combo].sort((a, b) => compareCards(a, b, trumpSuit));
}

// Determine trick winner (matching client-side logic exactly)
function determineTrickWinner(leadCard, responseCard, trumpSuit) {
  if (Array.isArray(leadCard) && Array.isArray(responseCard)) {
    // Combo vs combo
    return canBeatComboByPosition(leadCard, responseCard, trumpSuit);
  } else if (!Array.isArray(leadCard) && Array.isArray(responseCard)) {
    // Single card vs combo - combo wins if highest card beats the single
    const sortedCombo = getComboPlayOrder(responseCard, trumpSuit);
    return canBeat(leadCard, sortedCombo[sortedCombo.length - 1], trumpSuit);
  } else if (Array.isArray(leadCard) && !Array.isArray(responseCard)) {
    // Combo vs single card - combo always wins
    return false;
  } else {
    // Single card vs single card
    return canBeat(leadCard, responseCard, trumpSuit);
  }
}

module.exports = {
  canPlayCard,
  canPlayCombo,
  isCombo,
  isJoker,
  isTrump,
  mustFollowSuit,
  canBeat,
  canBeatCombo,
  canBeatComboByPosition,
  determineTrickWinner,
  getComboPlayOrder,
  compareCards
};
