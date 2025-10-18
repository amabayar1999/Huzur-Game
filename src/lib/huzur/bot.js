import { canBeat, compareCards, isTrump, mustFollowSuit, getCardsInSuit, isJoker, isCombo, canBeatCombo, canBeatComboByPosition, canPlayCombo, getComboPlayOrder } from './cards';
import { COMBO_SIZES, CARD_POWER, RANKS } from './constants';

// Strategic game phase detection
function getGamePhase(deckLength, trumpCardDrawn) {
  const totalCards = 54; // 52 cards + 2 jokers
  const cardsPlayed = totalCards - deckLength;
  
  if (cardsPlayed < 20) return 'early';
  if (cardsPlayed < 40) return 'mid';
  return 'late';
}

// Determine if bot should conserve trump cards
function shouldConserveTrumps(gamePhase, deckLength, trumpCardDrawn) {
  // Be more conservative with trumps in early game, but not overly so
  if (gamePhase === 'early') return true;
  
  // If deck is running low, be more aggressive
  if (deckLength < 10) return false;
  
  // If trump card not drawn yet, be moderately conservative
  if (!trumpCardDrawn) return true;
  
  // In mid game, be balanced (not too conservative)
  return gamePhase === 'mid';
}

// Count trump cards in hand
function countTrumpsInHand(hand, trumpSuit) {
  return hand.filter(card => isTrump(card, trumpSuit)).length;
}

// Adjust strategy based on trump count
function adjustStrategyForTrumpCount(trumpCount, gamePhase) {
  if (trumpCount >= 3 && gamePhase === 'early') {
    return 'very_conservative'; // Save most trumps
  }
  if (trumpCount <= 1 && gamePhase === 'late') {
    return 'aggressive'; // Use remaining trumps
  }
  return 'balanced';
}

// Enhanced card power calculation with strategic considerations
function calculateStrategicCardValue(card, trumpSuit, gamePhase, shouldConserve, trumpCount) {
  const basePower = isJoker(card) ? CARD_POWER.JOKER : 
    RANKS.indexOf(card.rank) * CARD_POWER.BASE_RANK_MULTIPLIER;
  
  // Add strategic modifiers
  let strategicValue = basePower;
  
  if (isTrump(card, trumpSuit)) {
    // Trump cards are more valuable - but allow lower-value trumps
    if (shouldConserve) {
      // Only add penalty for high-value trump cards
      if (card.rank === 'A' || card.rank === '2' || card.rank === '3') {
        strategicValue += 50; // High-value trumps get penalty
      } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') {
        strategicValue += 20; // Medium-value trumps get smaller penalty
      }
      // Low-value trumps (7, 8, 9, 10) get no penalty - can be used freely
    }
    
    // Adjust based on trump count in hand
    const strategy = adjustStrategyForTrumpCount(trumpCount, gamePhase);
    if (strategy === 'very_conservative') {
      // Even in very conservative mode, allow low-value trumps
      if (card.rank === 'A' || card.rank === '2' || card.rank === '3') {
        strategicValue += 40;
      } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') {
        strategicValue += 15;
      }
      // Low-value trumps still get no penalty
    } else if (strategy === 'aggressive') {
      strategicValue -= 20;
    }
  }
  
  // Jokers are always very valuable
  if (isJoker(card)) {
    strategicValue += shouldConserve ? 100 : 50;
  }
  
  return strategicValue;
}

// Helper function to find the best ordering of cards that beats the lead combo
function findBestOrderingToBeatCombo(leadCombo, cards, trumpSuit) {
  // The lead combo is in player's selection order (not sorted!)
  // We need to find an ordering of our cards that beats it position-by-position
  // Position 0 of response must beat position 0 of lead, etc.
  
  // Try to find a valid permutation using greedy assignment
  // For each position in lead, try to assign the weakest card that still beats it
  const available = [...cards];
  const response = new Array(leadCombo.length);
  
  // For each position in the lead combo
  for (let i = 0; i < leadCombo.length; i++) {
    const leadCard = leadCombo[i];
    
    // Find all available cards that can beat this lead card
    const beatingCards = available.filter(card => canBeat(leadCard, card, trumpSuit));
    
    if (beatingCards.length === 0) {
      // Can't beat this position, try backtracking with permutations
      return findOrderingByPermutation(leadCombo, cards, trumpSuit);
    }
    
    // Choose the weakest card that beats this position to save stronger cards
    beatingCards.sort((a, b) => compareCards(a, b, trumpSuit));
    const chosenCard = beatingCards[0];
    
    response[i] = chosenCard;
    
    // Remove the chosen card from available cards
    const idx = available.findIndex(c => c === chosenCard);
    available.splice(idx, 1);
  }
  
  return response;
}

// Helper function to try all permutations (fallback for greedy failures)
function findOrderingByPermutation(leadCombo, cards, trumpSuit) {
  // Generate all permutations and find one that beats position-by-position
  const permutations = generatePermutations(cards);
  
  for (const perm of permutations) {
    let allBeat = true;
    for (let i = 0; i < leadCombo.length; i++) {
      if (!canBeat(leadCombo[i], perm[i], trumpSuit)) {
        allBeat = false;
        break;
      }
    }
    if (allBeat) {
      return perm;
    }
  }
  
  return null; // No valid ordering found
}

// Generate all permutations of an array
function generatePermutations(arr) {
  if (arr.length <= 1) return [arr];
  
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
    const perms = generatePermutations(remaining);
    for (const perm of perms) {
      result.push([current, ...perm]);
    }
  }
  return result;
}

// Helper function to find all possible combos in hand
// NOTE: This function has O(n^4) complexity for 3-card combos and O(n^6) for 5-card combos
// In practice, hand size is limited to ~5-10 cards, so performance is acceptable
// For larger hands, consider caching or limiting combo search
function findCombos(hand, trumpCardDrawn = true, isRespondingTo5CardCombo = false) {
  // Performance optimization: limit combo search for large hands
  if (hand.length > 15) {
    return []; // Skip combo search for very large hands
  }
  
  const combos = [];
  const rankCounts = {};
  
  // Count ranks
  hand.forEach(card => {
    if (!isJoker(card)) {
      rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    }
  });
  
  // Find ranks that appear at least twice
  const doubleRanks = Object.keys(rankCounts).filter(rank => rankCounts[rank] >= 2);
  
  // Generate 3-card combos (any combo with at least 2 cards of same rank)
  for (const rank of doubleRanks) {
    const cardsOfRank = hand.filter(card => card.rank === rank);
    const otherCards = hand.filter(card => card.rank !== rank);
    
    // Try all combinations of 2 cards of the same rank + 1 other card
    for (let i = 0; i < cardsOfRank.length - 1; i++) {
      for (let j = i + 1; j < cardsOfRank.length; j++) {
        // Can include another card of same rank (triplet)
        for (const otherCard of otherCards) {
          const combo = [cardsOfRank[i], cardsOfRank[j], otherCard];
          if (isCombo(combo)) {
            combos.push(combo);
          }
        }
        
        // Also try triplets if we have 3+ of the same rank
        if (cardsOfRank.length >= 3) {
          for (let k = j + 1; k < cardsOfRank.length; k++) {
            const triplet = [cardsOfRank[i], cardsOfRank[j], cardsOfRank[k]];
            if (isCombo(triplet)) {
              combos.push(triplet);
            }
          }
        }
      }
    }
  }
  
  // Generate 5-card combos (need at least 4 cards that can form pairs) if hand has enough cards
  // Only if trump card has been drawn OR we're responding to a 5-card combo
  // Valid patterns: 2+2+1, 3+2, 4+1, 3+1+1, etc.
  if (hand.length >= 5 && (trumpCardDrawn || isRespondingTo5CardCombo)) {
    const pairRanks = doubleRanks.filter(rank => rankCounts[rank] >= 2);
    
    // Pattern 1: Two different pairs + any fifth card (2+2+1)
    for (let i = 0; i < pairRanks.length - 1; i++) {
      for (let j = i + 1; j < pairRanks.length; j++) {
        const rank1 = pairRanks[i];
        const rank2 = pairRanks[j];
        const cardsOfRank1 = hand.filter(card => card.rank === rank1);
        const cardsOfRank2 = hand.filter(card => card.rank === rank2);
        const otherCards = hand.filter(card => card.rank !== rank1 && card.rank !== rank2);
        
        // Try all combinations
        for (let k = 0; k < cardsOfRank1.length - 1; k++) {
          for (let l = k + 1; l < cardsOfRank1.length; l++) {
            for (let m = 0; m < cardsOfRank2.length - 1; m++) {
              for (let n = m + 1; n < cardsOfRank2.length; n++) {
                // Can use any fifth card (including cards of rank1 or rank2)
                for (const otherCard of otherCards) {
                  const combo = [cardsOfRank1[k], cardsOfRank1[l], cardsOfRank2[m], cardsOfRank2[n], otherCard];
                  if (isCombo(combo)) {
                    combos.push(combo);
                  }
                }
                
                // Also try using a third card from rank1 if available (3+2 pattern)
                if (cardsOfRank1.length >= 3) {
                  for (let o = 0; o < cardsOfRank1.length; o++) {
                    if (o !== k && o !== l) {
                      const combo = [cardsOfRank1[k], cardsOfRank1[l], cardsOfRank1[o], cardsOfRank2[m], cardsOfRank2[n]];
                      if (isCombo(combo)) {
                        combos.push(combo);
                      }
                    }
                  }
                }
                
                // Also try using a third card from rank2 if available (2+3 pattern)
                if (cardsOfRank2.length >= 3) {
                  for (let o = 0; o < cardsOfRank2.length; o++) {
                    if (o !== m && o !== n) {
                      const combo = [cardsOfRank1[k], cardsOfRank1[l], cardsOfRank2[m], cardsOfRank2[n], cardsOfRank2[o]];
                      if (isCombo(combo)) {
                        combos.push(combo);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Pattern 2: One rank with 4 cards + any fifth card (4+1 pattern)
    for (const rank of pairRanks) {
      const cardsOfRank = hand.filter(card => card.rank === rank);
      if (cardsOfRank.length >= 4) {
        const otherCards = hand.filter(card => card.rank !== rank);
        for (const otherCard of otherCards) {
          const combo = [cardsOfRank[0], cardsOfRank[1], cardsOfRank[2], cardsOfRank[3], otherCard];
          if (isCombo(combo)) {
            combos.push(combo);
          }
        }
      }
    }
  }
  
  return combos;
}

export function chooseBotResponse(leadCard, hand, trumpSuit, trumpCardDrawn = true, opponentHandSize = null, deckLength = 54) {
  // Calculate strategic parameters
  const gamePhase = getGamePhase(deckLength, trumpCardDrawn);
  const shouldConserve = shouldConserveTrumps(gamePhase, deckLength, trumpCardDrawn);
  const trumpCount = countTrumpsInHand(hand, trumpSuit);
  
  // When responding to a card, be less conservative to avoid picking up
  const isResponding = leadCard !== null;
  const shouldConserveWhenResponding = isResponding ? false : shouldConserve;
  
  if (!leadCard) {
    // Bot is leading - use strategic card selection
    const combos = findCombos(hand, trumpCardDrawn, false);
    
    // Filter out combos that the opponent can't respond to
    const playableCombos = combos.filter(combo => {
      // If we don't know opponent's hand size, allow all combos (backward compatibility)
      if (opponentHandSize === null) return true;
      
      // Don't play a combo if opponent has fewer cards than the combo size
      return opponentHandSize >= combo.length;
    });
    
    if (playableCombos.length > 0) {
      // Play the combo with the lowest strategic value
      return playableCombos.sort((a, b) => {
        const aValue = a.reduce((sum, card) => 
          sum + calculateStrategicCardValue(card, trumpSuit, gamePhase, shouldConserve, trumpCount), 0);
        const bValue = b.reduce((sum, card) => 
          sum + calculateStrategicCardValue(card, trumpSuit, gamePhase, shouldConserve, trumpCount), 0);
        return aValue - bValue;
      })[0];
    }
    
    // For single cards, use strategic sorting
    return hand.sort((a, b) => {
      const aValue = calculateStrategicCardValue(a, trumpSuit, gamePhase, shouldConserve, trumpCount);
      const bValue = calculateStrategicCardValue(b, trumpSuit, gamePhase, shouldConserve, trumpCount);
      return aValue - bValue;
    })[0];
  }
  
  // Check if lead is a combo
  if (isCombo(leadCard)) {
    // Must respond with cards that beat the lead combo
    const isRespondingTo5CardCombo = leadCard.length === COMBO_SIZES.LARGE;
    const combos = findCombos(hand, trumpCardDrawn, isRespondingTo5CardCombo);
    
    // Filter out combos that the opponent can't respond to
    const playableCombos = combos.filter(combo => {
      // If we don't know opponent's hand size, allow all combos (backward compatibility)
      if (opponentHandSize === null) return true;
      
      // Don't play a combo if opponent has fewer cards than the combo size
      return opponentHandSize >= combo.length;
    });
    
    const beatingCombosWithOrder = [];
    
    // For each playable combo, find the best ordering that beats the lead
    for (const combo of playableCombos) {
      const orderedCombo = findBestOrderingToBeatCombo(leadCard, combo, trumpSuit);
      if (orderedCombo) {
        beatingCombosWithOrder.push(orderedCombo);
      }
    }
    
    if (beatingCombosWithOrder.length > 0) {
      // Play the combo with the lowest strategic value that still beats
      return beatingCombosWithOrder.sort((a, b) => {
        const aValue = a.reduce((sum, card) => 
          sum + calculateStrategicCardValue(card, trumpSuit, gamePhase, shouldConserve, trumpCount), 0);
        const bValue = b.reduce((sum, card) => 
          sum + calculateStrategicCardValue(card, trumpSuit, gamePhase, shouldConserve, trumpCount), 0);
        return aValue - bValue;
      })[0];
    }
    
    // Can't beat with combo, must pick up
    return null;
  }
  
  // Lead is a single card - can only respond with single card (no combos allowed)
  
  // Must follow suit if possible
  if (mustFollowSuit(leadCard, hand)) {
    const inSuit = getCardsInSuit(hand, leadCard.suit);
    const beatingInSuit = inSuit.filter(c => canBeat(leadCard, c, trumpSuit));
    
    if (beatingInSuit.length > 0) {
      // Play lowest strategic value card that still beats
      return beatingInSuit.sort((a, b) => {
        const aValue = calculateStrategicCardValue(a, trumpSuit, gamePhase, shouldConserveWhenResponding, trumpCount);
        const bValue = calculateStrategicCardValue(b, trumpSuit, gamePhase, shouldConserveWhenResponding, trumpCount);
        return aValue - bValue;
      })[0];
    }
    
    // Can't beat with in-suit cards, must pick up
    return null;
  }
  
  // Can play off-suit: try to beat with trump
  const trumps = hand.filter(c => isTrump(c, trumpSuit));
  const beatingTrumps = trumps.filter(c => canBeat(leadCard, c, trumpSuit));
  if (beatingTrumps.length > 0) {
    // Use strategic value for trump selection (less conservative when responding)
    return beatingTrumps.sort((a, b) => {
      const aValue = calculateStrategicCardValue(a, trumpSuit, gamePhase, shouldConserveWhenResponding, trumpCount);
      const bValue = calculateStrategicCardValue(b, trumpSuit, gamePhase, shouldConserveWhenResponding, trumpCount);
      return aValue - bValue;
    })[0];
  }
  
  // Can't beat, must pick up
  return null;
}


