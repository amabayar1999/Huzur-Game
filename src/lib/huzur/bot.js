import { canBeat, compareCards, isTrump, mustFollowSuit, getCardsInSuit, isJoker, isCombo, canBeatCombo, canBeatComboByPosition, canPlayCombo, getComboPlayOrder } from './cards';
import { COMBO_SIZES, CARD_POWER } from './constants';

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

export function chooseBotResponse(leadCard, hand, trumpSuit, trumpCardDrawn = true) {
  if (!leadCard) {
    // Bot is leading - try to play a combo first, otherwise play lowest card
    const combos = findCombos(hand, trumpCardDrawn, false);
    if (combos.length > 0) {
      // Play the combo with the lowest total power
      return combos.sort((a, b) => {
        const aPower = a.reduce((sum, card) => sum + (isJoker(card) ? CARD_POWER.JOKER : compareCards(card, {rank: '7', suit: 'H'}, trumpSuit)), 0);
        const bPower = b.reduce((sum, card) => sum + (isJoker(card) ? CARD_POWER.JOKER : compareCards(card, {rank: '7', suit: 'H'}, trumpSuit)), 0);
        return aPower - bPower;
      })[0];
    }
    return hand.sort((a, b) => compareCards(a, b, trumpSuit))[0];
  }
  
  // Check if lead is a combo
  if (isCombo(leadCard)) {
    // Must respond with cards that beat the lead combo
    const isRespondingTo5CardCombo = leadCard.length === COMBO_SIZES.LARGE;
    const combos = findCombos(hand, trumpCardDrawn, isRespondingTo5CardCombo);
    const beatingCombosWithOrder = [];
    
    // For each combo, find the best ordering that beats the lead
    for (const combo of combos) {
      const orderedCombo = findBestOrderingToBeatCombo(leadCard, combo, trumpSuit);
      if (orderedCombo) {
        beatingCombosWithOrder.push(orderedCombo);
      }
    }
    
    if (beatingCombosWithOrder.length > 0) {
      // Play the combo with the lowest total power that still beats
      return beatingCombosWithOrder.sort((a, b) => {
        const aPower = a.reduce((sum, card) => sum + (isJoker(card) ? CARD_POWER.JOKER : compareCards(card, {rank: '7', suit: 'H'}, trumpSuit)), 0);
        const bPower = b.reduce((sum, card) => sum + (isJoker(card) ? CARD_POWER.JOKER : compareCards(card, {rank: '7', suit: 'H'}, trumpSuit)), 0);
        return aPower - bPower;
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
      // Play lowest card that still beats
      return beatingInSuit.sort((a, b) => compareCards(a, b, trumpSuit))[0];
    }
    
    // Can't beat with in-suit cards, must pick up
    return null;
  }
  
  // Can play off-suit: try to beat with trump
  const trumps = hand.filter(c => isTrump(c, trumpSuit));
  const beatingTrumps = trumps.filter(c => canBeat(leadCard, c, trumpSuit));
  if (beatingTrumps.length > 0) {
    return beatingTrumps.sort((a, b) => compareCards(a, b, trumpSuit))[0];
  }
  
  // Can't beat, must pick up
  return null;
}


