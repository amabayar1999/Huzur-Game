import { canBeat, compareCards, isTrump, mustFollowSuit, getCardsInSuit, isJoker, isCombo, canBeatCombo, canBeatComboByPosition, canPlayCombo, getComboPlayOrder } from './cards';
import { COMBO_SIZES, CARD_POWER, RANKS, DIFFICULTY_LEVELS } from './constants';

// Strategic game phase detection with enhanced endgame phases
function getGamePhase(deckLength, trumpCardDrawn) {
  const totalCards = 54; // 52 cards + 2 jokers
  const cardsPlayed = totalCards - deckLength;
  
  if (cardsPlayed < 15) return 'early';
  if (cardsPlayed < 30) return 'mid';
  if (cardsPlayed < 45) return 'late';
  if (deckLength < 8) return 'critical';  // New critical phase
  return 'endgame';  // New endgame phase
}

// Determine if bot should conserve trump cards based on difficulty
function shouldConserveTrumps(gamePhase, deckLength, trumpCardDrawn, difficulty = DIFFICULTY_LEVELS.MEDIUM) {
  // Ensure difficulty is not null and has required properties
  const safeDifficulty = difficulty || DIFFICULTY_LEVELS.MEDIUM;
  const baseConservation = safeDifficulty.trumpConservation || 0.5;
  
  // Adjust based on game phase with enhanced endgame logic
  let phaseModifier = 0;
  if (gamePhase === 'early') phaseModifier = 0.3;      // More conservative early
  else if (gamePhase === 'mid') phaseModifier = 0.1;   // Slightly conservative mid
  else if (gamePhase === 'late') phaseModifier = -0.1; // Start becoming aggressive
  else if (gamePhase === 'critical') phaseModifier = -0.2; // More aggressive in critical
  else phaseModifier = -0.4;                           // Very aggressive in endgame
  
  // Enhanced endgame logic - start conserving earlier
  if (deckLength < 10) phaseModifier -= 0.3;  // Earlier trigger for endgame pressure
  if (deckLength < 5) phaseModifier -= 0.4;   // Strong endgame pressure
  
  // If trump card not drawn yet, be more conservative
  if (!trumpCardDrawn) phaseModifier += 0.3;
  
  // Apply endgame aggression modifier
  if (deckLength < 5) {
    phaseModifier -= (safeDifficulty.endgameAggression || 0.7) * 0.5;
  }
  
  const finalConservation = Math.max(0, Math.min(1, baseConservation + phaseModifier));
  return finalConservation > 0.4; // Lower threshold for conservation
}

// Count trump cards in hand
function countTrumpsInHand(hand, trumpSuit) {
  return hand.filter(card => isTrump(card, trumpSuit)).length;
}

// Adjust strategy based on trump count with enhanced logic
function adjustStrategyForTrumpCount(trumpCount, gamePhase, deckLength) {
  // More sophisticated trump count analysis
  if (trumpCount >= 4 && (gamePhase === 'early' || gamePhase === 'mid')) {
    return 'very_conservative'; // Save most trumps when we have many
  }
  if (trumpCount >= 3 && gamePhase === 'early') {
    return 'conservative'; // Be conservative with 3+ trumps early
  }
  if (trumpCount >= 2 && (gamePhase === 'critical' || gamePhase === 'endgame')) {
    return 'aggressive'; // Use trumps when deck is low
  }
  if (trumpCount <= 2 && (gamePhase === 'critical' || gamePhase === 'endgame')) {
    return 'aggressive'; // Use remaining trumps in endgame
  }
  if (trumpCount <= 1 && deckLength < 8) {
    return 'desperate'; // Use any trump available when deck is very low
  }
  if (trumpCount <= 1 && gamePhase === 'late') {
    return 'aggressive'; // Use remaining trumps in late game
  }
  return 'balanced';
}

// Enhanced card power calculation with strategic considerations and difficulty
function calculateStrategicCardValue(card, trumpSuit, gamePhase, shouldConserve, trumpCount, difficulty = DIFFICULTY_LEVELS.MEDIUM, context = {}) {
  // Ensure difficulty is not null and has required properties
  const safeDifficulty = difficulty || DIFFICULTY_LEVELS.MEDIUM;
  
  const basePower = isJoker(card) ? CARD_POWER.JOKER : 
    RANKS.indexOf(card.rank) * CARD_POWER.BASE_RANK_MULTIPLIER;
  
  // Add strategic modifiers
  let strategicValue = basePower;
  
  if (isTrump(card, trumpSuit)) {
    // Trump cards are more valuable - adjust based on difficulty and context
    if (shouldConserve) {
      // Scale penalties based on difficulty level
      const penaltyMultiplier = safeDifficulty.trumpConservation || 0.5;
      
      if (isJoker(card)) {
        strategicValue += 80 * penaltyMultiplier; // Jokers are most valuable
      } else if (card.rank === 'A' || card.rank === '2' || card.rank === '3') {
        strategicValue += 60 * penaltyMultiplier; // High-value trumps get strong penalty
      } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') {
        strategicValue += 30 * penaltyMultiplier; // Medium-value trumps get moderate penalty
      } else {
        strategicValue += 10 * penaltyMultiplier; // Low-value trumps get small penalty
      }
      
      // Extra protection in critical/endgame phases
      if (gamePhase === 'critical' || gamePhase === 'endgame') {
        if (isJoker(card)) strategicValue += 40;
        else if (card.rank === 'A' || card.rank === '2' || card.rank === '3') {
          strategicValue += 30;
        }
      }
    }
    
    // Adjust based on trump count in hand with enhanced logic
    const strategy = adjustStrategyForTrumpCount(trumpCount, gamePhase, context.deckLength);
    if (strategy === 'very_conservative') {
      // Even in very conservative mode, allow low-value trumps
      if (isJoker(card)) {
        strategicValue += 50 * (safeDifficulty.trumpConservation || 0.5);
      } else if (card.rank === 'A' || card.rank === '2' || card.rank === '3') {
        strategicValue += 40 * (safeDifficulty.trumpConservation || 0.5);
      } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') {
        strategicValue += 15 * (safeDifficulty.trumpConservation || 0.5);
      }
      // Low-value trumps still get no penalty
    } else if (strategy === 'aggressive') {
      strategicValue -= 20 * (1 - (safeDifficulty.trumpConservation || 0.5));
    } else if (strategy === 'desperate') {
      // When desperate, use any trump available
      strategicValue -= 40 * (1 - (safeDifficulty.trumpConservation || 0.5));
    }
    
    // Context-aware trump usage with enhanced endgame logic
    if (context.forceOpponentPickup && context.pileSize > 3) {
      // If we can force opponent to pick up a large pile, be more aggressive with trumps
      strategicValue -= 30 * (1 - (safeDifficulty.trumpConservation || 0.5));
    }
    
    if (context.endgamePressure && context.deckLength < 8) {
      // In endgame, use trumps more aggressively - earlier trigger
      strategicValue -= 25 * (1 - (safeDifficulty.trumpConservation || 0.5));
    }
    
    if (context.deckExhausted) {
      // When deck is exhausted, be very aggressive with trumps and jokers
      strategicValue -= 50 * (1 - (safeDifficulty.trumpConservation || 0.5));
    }
    
    if (context.opponentWeakness && context.opponentTrumpsPlayed > 1) {
      // If opponent has played many trumps, exploit their weakness
      strategicValue -= 20 * (1 - (safeDifficulty.trumpConservation || 0.5));
    }
  }
  
  // Enhanced joker strategy with deck exhaustion logic
  if (isJoker(card)) {
    let jokerValue = shouldConserve ? 100 : 50;
    
    // Joker type-specific strategy
    if (card.rank === 'RJ') {
      // Red Joker (♥♦) - more aggressive in hearts/diamonds situations
      if (context.leadCard && (context.leadCard.suit === 'H' || context.leadCard.suit === 'D')) {
        jokerValue -= 20; // Use Red Joker more readily against hearts/diamonds
      }
    } else if (card.rank === 'BJ') {
      // Black Joker (♠♣) - more aggressive in spades/clubs situations
      if (context.leadCard && (context.leadCard.suit === 'S' || context.leadCard.suit === 'C')) {
        jokerValue -= 20; // Use Black Joker more readily against spades/clubs
      }
    }
    
    // Save jokers for critical moments
    if (context.criticalMoment) {
      jokerValue += 30; // Save jokers for critical moments
    }
    
    // Use jokers when opponent is likely to have strong cards
    if (context.opponentStrongHand) {
      jokerValue -= 25; // Use jokers to counter strong opponent hands
    }
    
    // When deck is exhausted, be very aggressive with jokers
    if (context.deckExhausted) {
      jokerValue -= 40; // Use jokers aggressively when deck is empty
    }
    
    // In endgame phases, be more willing to use jokers
    if (gamePhase === 'critical' || gamePhase === 'endgame') {
      jokerValue -= 20;
    }
    
    strategicValue += jokerValue * (safeDifficulty.trumpConservation || 0.5);
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

// Enhanced opponent hand tracking and prediction
function trackOpponentCards(playedCards, opponentHandSize, trumpSuit) {
  const opponentPlayed = playedCards.filter(play => play.player === 'human');
  const suitsPlayed = {};
  const ranksPlayed = {};
  let trumpCardsPlayed = 0;
  let jokersPlayed = 0;
  const recentPlays = opponentPlayed.slice(-5); // Last 5 plays for pattern analysis
  
  opponentPlayed.forEach(card => {
    if (isTrump(card, trumpSuit)) {
      trumpCardsPlayed++;
    }
    if (isJoker(card)) {
      jokersPlayed++;
    }
    suitsPlayed[card.suit] = (suitsPlayed[card.suit] || 0) + 1;
    ranksPlayed[card.rank] = (ranksPlayed[card.rank] || 0) + 1;
  });
  
  return {
    suitsPlayed,
    ranksPlayed,
    trumpCardsPlayed,
    jokersPlayed,
    totalPlayed: opponentPlayed.length,
    recentPlays,
    opponentHandSize
  };
}

// Enhanced opponent hand prediction with advanced analysis
function predictOpponentHand(opponentInfo, trumpSuit, difficulty) {
  const safeDifficulty = difficulty || DIFFICULTY_LEVELS.MEDIUM;
  if (!safeDifficulty.prediction) {
    return { likelyTrumps: 0, weakSuits: [], strongSuits: [], handStrength: 'unknown' };
  }
  
  // Basic prediction based on played cards
  const likelyTrumps = Math.max(0, 2 - opponentInfo.trumpCardsPlayed); // Assume 2 trumps per player on average
  const likelyJokers = Math.max(0, 1 - opponentInfo.jokersPlayed); // Assume 1 joker per player on average
  
  const weakSuits = Object.keys(opponentInfo.suitsPlayed).filter(suit => 
    opponentInfo.suitsPlayed[suit] >= 2 // If they've played 2+ of a suit, likely weak
  );
  const strongSuits = Object.keys(opponentInfo.suitsPlayed).filter(suit => 
    opponentInfo.suitsPlayed[suit] === 1 // If they've only played 1, might be strong
  );
  
  // Analyze hand strength based on recent plays
  let handStrength = 'unknown';
  if (opponentInfo.recentPlays.length >= 3) {
    const recentTrumps = opponentInfo.recentPlays.filter(card => isTrump(card, trumpSuit)).length;
    const recentJokers = opponentInfo.recentPlays.filter(card => isJoker(card)).length;
    
    if (recentTrumps >= 2 || recentJokers >= 1) {
      handStrength = 'weak'; // Playing many trumps/jokers suggests weak hand
    } else if (recentTrumps === 0 && recentJokers === 0) {
      handStrength = 'strong'; // Not using trumps/jokers suggests strong hand
    }
  }
  
  return { 
    likelyTrumps, 
    likelyJokers,
    weakSuits, 
    strongSuits, 
    handStrength,
    trumpCardsPlayed: opponentInfo.trumpCardsPlayed,
    jokersPlayed: opponentInfo.jokersPlayed
  };
}

// Build strategic context for decision making with enhanced endgame indicators
function buildStrategicContext(leadCard, pile, deckLength, opponentInfo, trumpSuit, gamePhase, trumpCardDrawn) {
  const context = {
    leadCard,
    pileSize: pile ? pile.length : 0,
    deckLength,
    gamePhase,
    forceOpponentPickup: false,
    endgamePressure: false,
    opponentWeakness: false,
    criticalMoment: false,
    opponentStrongHand: false,
    opponentTrumpsPlayed: opponentInfo.trumpCardsPlayed || 0,
    // New endgame indicators
    isEndgame: deckLength < 8,
    isCritical: deckLength < 5,
    trumpCardAvailable: !trumpCardDrawn,
    deckExhausted: deckLength === 0
  };
  
  // Determine if we can force opponent pickup
  if (pile && pile.length > 3) {
    context.forceOpponentPickup = true;
  }
  
  // Enhanced endgame pressure detection
  if (deckLength < 8) {
    context.endgamePressure = true;
  }
  
  // Opponent weakness indicators
  if (opponentInfo.trumpCardsPlayed > 1) {
    context.opponentWeakness = true;
  }
  
  // Critical moments (late game, high pile, etc.)
  if (deckLength < 10 || (pile && pile.length > 2)) {
    context.criticalMoment = true;
  }
  
  // Opponent hand strength
  if (opponentInfo.handStrength === 'strong') {
    context.opponentStrongHand = true;
  }
  
  return context;
}

// Enhanced combo selection with trump/joker strategy
function findOptimalCombos(hand, trumpCardDrawn, isRespondingTo5CardCombo, opponentInfo, trumpSuit, difficulty) {
  const combos = findCombos(hand, trumpCardDrawn, isRespondingTo5CardCombo);
  const safeDifficulty = difficulty || DIFFICULTY_LEVELS.MEDIUM;
  
  if (!safeDifficulty.prediction || !opponentInfo) {
    return combos;
  }
  
  // Analyze combos for trump/joker usage
  const analyzedCombos = combos.map(combo => {
    const trumpCount = combo.filter(card => isTrump(card, trumpSuit)).length;
    const jokerCount = combo.filter(card => isJoker(card)).length;
    const hasHighValueTrump = combo.some(card => 
      isTrump(card, trumpSuit) && (card.rank === 'A' || card.rank === '2' || card.rank === '3')
    );
    
    return {
      combo,
      trumpCount,
      jokerCount,
      hasHighValueTrump,
      strategicValue: trumpCount * 10 + jokerCount * 20 + (hasHighValueTrump ? 15 : 0)
    };
  });
  
  // Filter combos that opponent likely can't beat
  return analyzedCombos.filter(comboData => {
    const combo = comboData.combo;
    
    // If opponent has fewer cards than combo size, they can't respond
    if (opponentInfo.opponentHandSize < combo.length) return true;
    
    // For higher difficulties, be more strategic about combo selection
    if ((safeDifficulty.comboAggression || 0.6) > 0.8) {
      // Prefer combos with fewer trump cards when opponent is weak
      if (opponentInfo.trumpCardsPlayed > 1 && comboData.trumpCount > 1) {
        return false; // Don't waste trumps when opponent is weak
      }
      
      // Use high-value trump combos when opponent is strong
      if (opponentInfo.handStrength === 'strong' && comboData.hasHighValueTrump) {
        return true; // Use strong trump combos against strong opponents
      }
    }
    
    return true;
  }).map(comboData => comboData.combo);
}

export function chooseBotResponse(leadCard, hand, trumpSuit, trumpCardDrawn = true, opponentHandSize = null, deckLength = 54, difficulty = DIFFICULTY_LEVELS.MEDIUM, playedCards = [], pile = []) {
  // Ensure difficulty is not null
  const safeDifficulty = difficulty || DIFFICULTY_LEVELS.MEDIUM;
  
  // Calculate strategic parameters
  const gamePhase = getGamePhase(deckLength, trumpCardDrawn);
  const shouldConserve = shouldConserveTrumps(gamePhase, deckLength, trumpCardDrawn, safeDifficulty);
  const trumpCount = countTrumpsInHand(hand, trumpSuit);
  
  // Track opponent's played cards for prediction
  const opponentInfo = trackOpponentCards(playedCards, opponentHandSize, trumpSuit);
  const opponentPrediction = predictOpponentHand(opponentInfo, trumpSuit, safeDifficulty);
  
  // Build strategic context
  const context = buildStrategicContext(leadCard, pile, deckLength, opponentInfo, trumpSuit, gamePhase, trumpCardDrawn);
  
  // When responding to a card, be less conservative to avoid picking up
  const isResponding = leadCard !== null;
  const shouldConserveWhenResponding = isResponding ? false : shouldConserve;
  
  if (!leadCard) {
    // Bot is leading - use strategic card selection with difficulty
    const combos = findOptimalCombos(hand, trumpCardDrawn, false, { opponentHandSize }, trumpSuit, safeDifficulty);
    
    // Filter out combos that the opponent can't respond to
    const playableCombos = combos.filter(combo => {
      // If we don't know opponent's hand size, allow all combos (backward compatibility)
      if (opponentHandSize === null) return true;
      
      // Don't play a combo if opponent has fewer cards than the combo size
      return opponentHandSize >= combo.length;
    });
    
    // Adjust combo selection based on difficulty
    if (playableCombos.length > 0 && Math.random() < (safeDifficulty.comboAggression || 0.6)) {
      // Play the combo with the lowest strategic value
      return playableCombos.sort((a, b) => {
        const aValue = a.reduce((sum, card) => 
          sum + calculateStrategicCardValue(card, trumpSuit, gamePhase, shouldConserve, trumpCount, safeDifficulty, context), 0);
        const bValue = b.reduce((sum, card) => 
          sum + calculateStrategicCardValue(card, trumpSuit, gamePhase, shouldConserve, trumpCount, safeDifficulty, context), 0);
        return aValue - bValue;
      })[0];
    }
    
    // For single cards, use strategic sorting with difficulty
    return hand.sort((a, b) => {
      const aValue = calculateStrategicCardValue(a, trumpSuit, gamePhase, shouldConserve, trumpCount, safeDifficulty, context);
      const bValue = calculateStrategicCardValue(b, trumpSuit, gamePhase, shouldConserve, trumpCount, safeDifficulty, context);
      return aValue - bValue;
    })[0];
  }
  
  // Check if lead is a combo
  if (isCombo(leadCard)) {
    // Must respond with cards that beat the lead combo
    const isRespondingTo5CardCombo = leadCard.length === COMBO_SIZES.LARGE;
    const combos = findOptimalCombos(hand, trumpCardDrawn, isRespondingTo5CardCombo, { opponentHandSize }, trumpSuit, safeDifficulty);
    
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
          sum + calculateStrategicCardValue(card, trumpSuit, gamePhase, shouldConserve, trumpCount, safeDifficulty, context), 0);
        const bValue = b.reduce((sum, card) => 
          sum + calculateStrategicCardValue(card, trumpSuit, gamePhase, shouldConserve, trumpCount, safeDifficulty, context), 0);
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
        const aValue = calculateStrategicCardValue(a, trumpSuit, gamePhase, shouldConserveWhenResponding, trumpCount, safeDifficulty, context);
        const bValue = calculateStrategicCardValue(b, trumpSuit, gamePhase, shouldConserveWhenResponding, trumpCount, safeDifficulty, context);
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
      const aValue = calculateStrategicCardValue(a, trumpSuit, gamePhase, shouldConserveWhenResponding, trumpCount, safeDifficulty, context);
      const bValue = calculateStrategicCardValue(b, trumpSuit, gamePhase, shouldConserveWhenResponding, trumpCount, safeDifficulty, context);
      return aValue - bValue;
    })[0];
  }
  
  // Can't beat, must pick up
  return null;
}


