import { canBeat, compareCards, isTrump, mustFollowSuit, getCardsInSuit, isJoker, isCombo, canBeatCombo, canPlayCombo, getComboPlayOrder } from './cards';

// Helper function to find all possible combos in hand
function findCombos(hand) {
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
  
  // Generate 3-card combos (pair + 1 other)
  for (const rank of doubleRanks) {
    const cardsOfRank = hand.filter(card => card.rank === rank);
    const otherCards = hand.filter(card => card.rank !== rank);
    
    // Try all combinations of 2 cards of the same rank + 1 other card
    for (let i = 0; i < cardsOfRank.length - 1; i++) {
      for (let j = i + 1; j < cardsOfRank.length; j++) {
        for (const otherCard of otherCards) {
          const combo = [cardsOfRank[i], cardsOfRank[j], otherCard];
          if (isCombo(combo)) {
            combos.push(combo);
          }
        }
      }
    }
  }
  
  // Generate 5-card combos (2 pairs + 1 other) if hand has enough cards
  if (hand.length >= 5) {
    const pairRanks = doubleRanks.filter(rank => rankCounts[rank] >= 2);
    
    // Try all combinations of 2 different pairs + 1 other card
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
                for (const otherCard of otherCards) {
                  const combo = [cardsOfRank1[k], cardsOfRank1[l], cardsOfRank2[m], cardsOfRank2[n], otherCard];
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
  
  return combos;
}

export function chooseBotResponse(leadCard, hand, trumpSuit) {
  if (!leadCard) {
    // Bot is leading - try to play a combo first, otherwise play lowest card
    const combos = findCombos(hand);
    if (combos.length > 0) {
      // Play the combo with the lowest total power
      return combos.sort((a, b) => {
        const aPower = a.reduce((sum, card) => sum + (isJoker(card) ? 100 : compareCards(card, {rank: '7', suit: 'H'}, trumpSuit)), 0);
        const bPower = b.reduce((sum, card) => sum + (isJoker(card) ? 100 : compareCards(card, {rank: '7', suit: 'H'}, trumpSuit)), 0);
        return aPower - bPower;
      })[0];
    }
    return hand.sort((a, b) => compareCards(a, b, trumpSuit))[0];
  }
  
  // Check if lead is a combo
  if (isCombo(leadCard)) {
    // Must respond with a combo that beats the lead combo
    const combos = findCombos(hand);
    const beatingCombos = combos.filter(combo => canBeatCombo(leadCard, combo, trumpSuit));
    
    if (beatingCombos.length > 0) {
      // Play the combo with the lowest total power that still beats
      return beatingCombos.sort((a, b) => {
        const aPower = a.reduce((sum, card) => sum + (isJoker(card) ? 100 : compareCards(card, {rank: '7', suit: 'H'}, trumpSuit)), 0);
        const bPower = b.reduce((sum, card) => sum + (isJoker(card) ? 100 : compareCards(card, {rank: '7', suit: 'H'}, trumpSuit)), 0);
        return aPower - bPower;
      })[0];
    }
    
    // Can't beat with combo, must pick up
    return null;
  }
  
  // Lead is a single card - can respond with combo or single card
  const combos = findCombos(hand);
  const beatingCombos = combos.filter(combo => {
    const sortedCombo = getComboPlayOrder(combo, trumpSuit);
    return canBeat(leadCard, sortedCombo[sortedCombo.length - 1], trumpSuit); // Highest card beats single card
  });
  
  if (beatingCombos.length > 0) {
    // Play the combo with the lowest total power that beats
    return beatingCombos.sort((a, b) => {
      const aPower = a.reduce((sum, card) => sum + (isJoker(card) ? 100 : compareCards(card, {rank: '7', suit: 'H'}, trumpSuit)), 0);
      const bPower = b.reduce((sum, card) => sum + (isJoker(card) ? 100 : compareCards(card, {rank: '7', suit: 'H'}, trumpSuit)), 0);
      return aPower - bPower;
    })[0];
  }
  
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


