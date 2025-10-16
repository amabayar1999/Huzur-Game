// Card helpers and core rules for Huzur

export const SUITS = ['H', 'S', 'D', 'C'];
export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', '3', '2', 'A']; // Removed 4, 5, 6 for traditional Huzur

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  // Add Jokers
  deck.push({ rank: 'BJ', suit: null });
  deck.push({ rank: 'RJ', suit: null });
  return shuffle(deck);
}

export function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function jokerToTrumpSuit(card) {
  if (!card) return null;
  if (card.rank === 'BJ') return 'S';
  if (card.rank === 'RJ') return 'H';
  return null;
}

export function isJoker(card) {
  return card && (card.rank === 'BJ' || card.rank === 'RJ');
}

export function isTrump(card, trumpSuit) {
  if (!card) return false;
  if (isJoker(card)) return true;
  return card.suit === trumpSuit;
}

const RANK_ORDER = new Map(
  RANKS.map((r, idx) => [r, idx])
);

function compareWithinSameSuit(a, b) {
  // Assumes neither is a Joker and suits are same
  const ai = RANK_ORDER.get(a.rank);
  const bi = RANK_ORDER.get(b.rank);
  if (ai < bi) return -1;
  if (ai > bi) return 1;
  return 0;
}

export function compareCards(a, b, trumpSuit) {
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

export function canBeat(lead, response, trumpSuit) {
  if (!lead || !response) return false;
  // Jokers always beat
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

export function formatCard(card) {
  if (!card) return '';
  if (card.rank === 'BJ') return 'Joker♣♠';
  if (card.rank === 'RJ') return 'Joker♥♦';
  const suitIcon = suitToIcon(card.suit);
  return `${card.rank}${suitIcon}`;
}

export function suitToIcon(suit) {
  switch (suit) {
  case 'H': return '♥';
  case 'S': return '♠';
  case 'D': return '♦';
  case 'C': return '♣';
  default: return '';
  }
}

export function sortCardsForDisplay(cards, trumpSuit) {
  return cards.slice().sort((a, b) => compareCards(a, b, trumpSuit));
}

// Follow suit validation functions
export function mustFollowSuit(leadCard, hand) {
  if (!leadCard || isJoker(leadCard)) return false;
  return hand.some(card => card.suit === leadCard.suit && !isJoker(card));
}

export function hasSuitInHand(hand, suit) {
  return hand.some(card => card.suit === suit && !isJoker(card));
}

export function getCardsInSuit(hand, suit) {
  return hand.filter(card => card.suit === suit && !isJoker(card));
}

// Combo detection functions - Traditional Huzur pairs+1 pattern
export function isCombo(cards) {
  if (!cards || (cards.length !== 3 && cards.length !== 5)) return false;
  
  const rankCounts = {};
  cards.forEach(card => {
    if (!isJoker(card)) {
      rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    }
  });
  
  const rankCountsArray = Object.values(rankCounts);
  
  if (cards.length === 3) {
    // 3 cards: exactly one rank appears twice (pair + 1 other)
    return rankCountsArray.length === 2 && rankCountsArray.includes(2) && rankCountsArray.includes(1);
  } else if (cards.length === 5) {
    // 5 cards: exactly two ranks appear twice (2 pairs + 1 other)
    return rankCountsArray.length === 3 && rankCountsArray.filter(count => count === 2).length === 2 && rankCountsArray.includes(1);
  }
  
  return false;
}

export function canBeatCombo(leadCombo, responseCombo, trumpSuit) {
  if (!isCombo(leadCombo) || !isCombo(responseCombo)) return false;
  
  // Both combos must be the same size
  if (leadCombo.length !== responseCombo.length) return false;
  
  // Sort both combos by power (ascending order for sequential play)
  const sortedLead = [...leadCombo].sort((a, b) => compareCards(a, b, trumpSuit));
  const sortedResponse = [...responseCombo].sort((a, b) => compareCards(a, b, trumpSuit));
  
  // For a combo to beat another combo, each card in the response must beat
  // the corresponding card in the lead when played in sequential order
  for (let i = 0; i < sortedLead.length; i++) {
    if (!canBeat(sortedLead[i], sortedResponse[i], trumpSuit)) {
      return false;
    }
  }
  
  return true;
}

// Function to check if any cards can beat a lead combo by array position
export function canBeatComboWithOrder(leadCombo, responseCards, trumpSuit) {
  // Lead must be a valid combo, but response can be any cards
  if (!isCombo(leadCombo)) return false;
  
  // Both must be the same size
  if (leadCombo.length !== responseCards.length) return false;
  
  // Keep both combos in their original order (no sorting)
  const leadCards = [...leadCombo];
  const orderedResponse = [...responseCards];
  
  // For any cards to beat a combo, each card in the response must beat
  // the corresponding card in the lead at the same array position
  for (let i = 0; i < leadCards.length; i++) {
    if (!canBeat(leadCards[i], orderedResponse[i], trumpSuit)) {
      return false;
    }
  }
  
  return true;
}

// Helper function to extract combo structure (pairs and singles)
function getComboStructure(combo, trumpSuit) {
  const rankCounts = {};
  combo.forEach(card => {
    if (!isJoker(card)) {
      rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    }
  });
  
  const pairs = [];
  const singles = [];
  
  // Group cards by rank
  Object.keys(rankCounts).forEach(rank => {
    const cardsOfRank = combo.filter(card => card.rank === rank);
    if (rankCounts[rank] === 2) {
      // This is a pair - take the higher card of the pair
      const sortedPair = cardsOfRank.sort((a, b) => compareCards(a, b, trumpSuit));
      pairs.push(sortedPair[1]); // Higher card of the pair
    } else if (rankCounts[rank] === 1) {
      // This is a single card
      singles.push(cardsOfRank[0]);
    }
  });
  
  if (combo.length === 3) {
    return {
      pair: pairs[0], // Single pair
      single: singles[0] // Single card
    };
  } else if (combo.length === 5) {
    return {
      pairs: pairs, // Two pairs
      single: singles[0] // Single card
    };
  }
  
  return null;
}

// Debug version that returns detailed information
export function canBeatComboDebug(leadCombo, responseCards, trumpSuit) {
  if (!isCombo(leadCombo)) {
    return { canBeat: false, reason: 'Lead is not a valid combo' };
  }
  
  if (!responseCards || responseCards.length === 0) {
    return { canBeat: false, reason: 'No response cards provided' };
  }
  
  if (leadCombo.length !== responseCards.length) {
    return { canBeat: false, reason: 'Different sizes' };
  }
  
  // Keep both combos in their original order (no sorting)
  const leadCards = [...leadCombo];
  const orderedResponse = [...responseCards];
  
  const comparisons = [];
  
  // Check each card at the same array position
  for (let i = 0; i < leadCards.length; i++) {
    const canBeatCard = canBeat(leadCards[i], orderedResponse[i], trumpSuit);
    comparisons.push({
      position: i,
      lead: leadCards[i],
      response: orderedResponse[i],
      canBeat: canBeatCard
    });
    if (!canBeatCard) {
      return { 
        canBeat: false, 
        reason: `Position ${i} cannot beat: ${formatCard(orderedResponse[i])} vs ${formatCard(leadCards[i])}`,
        comparisons 
      };
    }
  }
  
  return { canBeat: true, reason: 'All cards beat at their positions', comparisons };
}

export function canPlayCard(leadCard, card, hand, trumpSuit) {
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
  
  // Can play off-suit (any card when not following suit)
  return true;
}

// Helper function to get combo play order (ascending by power)
export function getComboPlayOrder(combo, trumpSuit) {
  return [...combo].sort((a, b) => compareCards(a, b, trumpSuit));
}

// Helper function to get combo play order based on selection order (first clicked goes first)
export function getComboPlayOrderBySelection(combo, trumpSuit) {
  // For now, return the combo as-is since the selection order is maintained
  // In a real implementation, you might want to sort by power within the same rank
  return [...combo];
}

export function canPlayCombo(leadCombo, responseCards, hand, trumpSuit) {
  if (!leadCombo) return true; // Leading with combo is always allowed
  
  // If responding to a combo, can play any cards that beat it
  if (isCombo(leadCombo)) {
    // Response can be any cards, not necessarily a valid combo
    if (!responseCards || responseCards.length === 0) {
      console.log('No response cards provided');
      return false;
    }
    
    // Add debug logging
    console.log('Lead combo:', leadCombo.map(c => formatCard(c)));
    console.log('Response cards:', responseCards.map(c => formatCard(c)));
    console.log('Lead combo size:', leadCombo.length);
    console.log('Response cards size:', responseCards.length);
    
    const canBeat = canBeatComboWithOrder(leadCombo, responseCards, trumpSuit);
    console.log('Can beat combo:', canBeat);
    
    if (!canBeat) {
      const debug = canBeatComboDebug(leadCombo, responseCards, trumpSuit);
      console.log('Debug info:', debug);
    }
    
    return canBeat;
  }
  
  // If responding to a single card with a combo, combo must beat the single card
  if (responseCards && (responseCards.length === 3 || responseCards.length === 5)) {
    return responseCards.every(card => canBeat(leadCombo, card, trumpSuit));
  }
  
  return false;
}


