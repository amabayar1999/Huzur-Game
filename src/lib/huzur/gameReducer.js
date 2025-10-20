import { createDeck, jokerToTrumpSuit, isJoker, formatCard, sortCardsForDisplay, canBeat, canPlayCard, mustFollowSuit, isCombo, canPlayCombo, canBeatCombo, canBeatComboByPosition, getComboPlayOrder, suitToIcon } from './cards';
import { chooseBotResponse } from './bot';
import { HAND_SIZE, COMBO_SIZES, DIFFICULTY_LEVELS } from './constants';

// Helper: Deal cards from deck
function deal(deck, count) {
  const hand = [];
  for (let i = 0; i < count && deck.length > 0; i++) {
    hand.push(deck.pop());
  }
  return hand;
}

// Helper: Draw cards to maintain hand size
function drawCardsToHandSize(deck, hand, trumpCard, targetSize = HAND_SIZE) {
  const newDeck = [...deck];
  const newHand = [...hand];
  let trumpCardWasDrawn = false;
  
  while (newDeck.length > 0 && newHand.length < targetSize) {
    const drawnCard = newDeck.pop();
    newHand.push(drawnCard);
    
    // Check if the trump card was just drawn (compare by rank and suit)
    if (drawnCard.rank === trumpCard.rank && drawnCard.suit === trumpCard.suit) {
      trumpCardWasDrawn = true;
    }
  }
  
  return { newDeck, newHand, trumpCardWasDrawn };
}

// Helper: Remove cards from hand by indices
function removeCardsFromHand(hand, indices) {
  const newHand = [...hand];
  // Remove in reverse order to maintain correct indices
  [...indices].sort((a, b) => b - a).forEach(idx => newHand.splice(idx, 1));
  return newHand;
}

// Helper: Determine trick winner
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

// Helper: Check if game is won
function checkWinCondition(hand) {
  return hand.length === 0;
}

// Helper: Handle bot playing a card (single or combo)
function playBotCard(state, choice) {
  let newBotHand, newPile, newLastPlay, newLog, newPlayedCards;
  
  if (Array.isArray(choice)) {
    // Bot played a combo
    const indices = choice.map(card => state.hands.bot.findIndex(c => c === card)).filter(idx => idx >= 0);
    newBotHand = removeCardsFromHand(state.hands.bot, indices);
    newPile = [...state.pile, ...choice];
    newLastPlay = { ...state.lastPlay, bot: choice };
    newLog = [...state.log, `Bot played combo (${choice.length} cards) - Pile: ${state.pile.length} -> ${newPile.length} cards`];
    newPlayedCards = [...state.playedCards, ...choice.map(card => ({ card, player: 'bot' }))];
  } else {
    // Bot played a single card
    const idx = state.hands.bot.findIndex(c => c === choice);
    newBotHand = removeCardsFromHand(state.hands.bot, [idx]);
    newPile = [...state.pile, choice];
    newLastPlay = { ...state.lastPlay, bot: choice };
    newLog = [...state.log, `Bot played ${formatCard(choice)}`];
    newPlayedCards = [...state.playedCards, { card: choice, player: 'bot' }];
  }
  
  return { newBotHand, newPile, newLastPlay, newLog, playedCard: choice, newPlayedCards };
}

// Helper: Handle bot leading after winning trick
function handleBotLead(state, botHand, deadPile, log) {
  const nextChoice = chooseBotResponse(null, botHand, state.trumpSuit, state.trumpCardDrawn, state.hands.human.length, state.deck.length, state.difficulty, state.playedCards, []);
  if (!nextChoice) {
    // Bot can't lead (shouldn't happen), pass turn to human
    return {
      ...state,
      pile: [],
      deadPile,
      hands: { ...state.hands, bot: botHand },
      turn: 'human',
      leadCard: null,
      log
    };
  }
  
  const { newBotHand, newPile, newLastPlay, newLog, newPlayedCards } = playBotCard(
    { ...state, hands: { ...state.hands, bot: botHand }, pile: [] }, 
    nextChoice
  );
  
  // Check for win condition
  const newWinner = checkWinCondition(newBotHand) ? 'bot' : null;
  
  // Draw cards (but not if bot already won)
  const { newDeck, newHand: finalBotHand, trumpCardWasDrawn } = newWinner
    ? { newDeck: [...state.deck], newHand: newBotHand, trumpCardWasDrawn: false }
    : drawCardsToHandSize(state.deck, newBotHand, state.trumpCard);
  
  // Update log if trump card was drawn
  const finalLog = trumpCardWasDrawn && !state.trumpCardDrawn
    ? [...newLog, `Bot drew ${formatCard(state.trumpCard)} - 5-card combos are now allowed!`]
    : newLog;
  
  return {
    ...state,
    deck: newDeck,
    pile: newPile,
    deadPile,
    hands: { ...state.hands, bot: finalBotHand },
    turn: 'human',
    leadCard: nextChoice,
    lastPlay: newLastPlay,
    log: finalLog,
    winner: newWinner,
    trumpCardDrawn: state.trumpCardDrawn || trumpCardWasDrawn,
    playedCards: newPlayedCards
  };
}

export function initGame(difficulty = DIFFICULTY_LEVELS.MEDIUM) {
  const deck = createDeck();
  const human = deal(deck, HAND_SIZE);
  const bot = deal(deck, HAND_SIZE);
  // Trump card is now the last card in the deck (will be drawn last)
  const trumpCard = deck[0]; // Peek at the bottom card without removing it
  let trumpSuit = trumpCard?.suit || jokerToTrumpSuit(trumpCard);
  const log = [];
  log.push(`Trump is ${trumpSuit || 'None'} from ${formatCard(trumpCard)} (card remains under deck, will be drawn last)`);
  log.push(`5-card combos will be unlocked when the trump card is drawn!`);
  log.push(`Bot difficulty: ${difficulty?.name || 'Medium'}`);
  return {
    deck,
    trumpCard, // Keep trump card reference (it's at deck[0])
    trumpCardDrawn: false, // Track when trump card is drawn
    pile: [],
    deadPile: [],
    trumpSuit: trumpSuit || 'H',
    hands: { human, bot },
    turn: 'human',
    leadCard: null,
    lastPlay: {},
    winner: null,
    log,
    difficulty, // Add difficulty to game state
    playedCards: [], // Track all played cards for bot prediction
  };
}


export function gameReducer(state, action) {
  // Handle uninitialized state safely (e.g., before client-side RESET)
  if (state == null) {
    if (action && action.type === 'RESET') return initGame();
    return state;
  }
  
  // Always allow RESET, even if there's a winner
  if (action.type === 'RESET') {
    return initGame(action.difficulty || state?.difficulty || DIFFICULTY_LEVELS.MEDIUM);
  }
  
  // Handle difficulty change
  if (action.type === 'CHANGE_DIFFICULTY') {
    return {
      ...state,
      difficulty: action.difficulty,
      log: [...state.log, `Bot difficulty changed to: ${action.difficulty.name}`]
    };
  }
  
  if (state.winner) return state;
  switch (action.type) {
  case 'HUMAN_PLAY': {
    const idx = action.index;
    const card = state.hands.human[idx];
    if (!card) return state;
    
    // Validate the play
    if (!canPlayCard(state.leadCard, card, state.hands.human, state.trumpSuit)) {
      if (state.leadCard && mustFollowSuit(state.leadCard, state.hands.human)) {
        if (card.suit !== state.leadCard.suit && !isJoker(card)) {
          return { ...state, log: [...state.log, `Must follow suit ${state.leadCard.suit}`] };
        } else {
          return { ...state, log: [...state.log, `Must play a card that beats ${formatCard(state.leadCard)} or pick up the pile`] };
        }
      }
      return { ...state, log: [...state.log, `Invalid play: ${formatCard(card)}`] };
    }
    
    // Create new state with card removed from hand
    const newHumanHand = removeCardsFromHand(state.hands.human, [idx]);
    const newPile = [...state.pile, card];
    const newLastPlay = { ...state.lastPlay, human: card };
    const newPlayedCards = [...state.playedCards, { card, player: 'human' }];
    
    // Check for win condition BEFORE drawing
    const newWinner = checkWinCondition(newHumanHand) ? 'human' : state.winner;
    
    // Draw cards to maintain hand size (but not if player already won)
    const { newDeck, newHand: newHumanHandAfterDraw, trumpCardWasDrawn } = newWinner 
      ? { newDeck: [...state.deck], newHand: newHumanHand, trumpCardWasDrawn: false }
      : drawCardsToHandSize(state.deck, newHumanHand, state.trumpCard);
    
    if (state.leadCard) {
      // Human is responding - resolve the trick
      const humanWon = determineTrickWinner(state.leadCard, card, state.trumpSuit);
      const winner = humanWon ? 'human' : 'bot';
      let newLog = [...state.log, `You played ${formatCard(card)} and ${humanWon ? 'won' : 'lost'} the trick`];
      
      // Add trump card message if it was just drawn
      if (trumpCardWasDrawn && !state.trumpCardDrawn) {
        newLog = [...newLog, `You drew ${formatCard(state.trumpCard)} - 5-card combos are now allowed!`];
      }
      
      // Move all cards from pile to dead pile
      const newDeadPile = [...state.deadPile, ...newPile];
      
      return {
        ...state,
        deck: newDeck,
        pile: [],
        deadPile: newDeadPile,
        hands: { ...state.hands, human: newHumanHandAfterDraw },
        turn: winner,
        leadCard: null,
        lastPlay: newLastPlay,
        log: newLog,
        winner: newWinner,
        trumpCardDrawn: state.trumpCardDrawn || trumpCardWasDrawn
      };
    } else {
      // Human is leading
      let newLog = [...state.log, `You led ${formatCard(card)}`];
      
      // Add trump card message if it was just drawn
      if (trumpCardWasDrawn && !state.trumpCardDrawn) {
        newLog = [...newLog, `You drew ${formatCard(state.trumpCard)} - 5-card combos are now allowed!`];
      }
      
      return {
        ...state,
        deck: newDeck,
        pile: newPile,
        hands: { ...state.hands, human: newHumanHandAfterDraw },
        turn: 'bot',
        leadCard: card,
        lastPlay: newLastPlay,
        log: newLog,
        winner: newWinner,
        trumpCardDrawn: state.trumpCardDrawn || trumpCardWasDrawn
      };
    }
  }
  case 'HUMAN_PLAY_COMBO': {
    const indices = action.indices;
    const combo = indices.map(idx => state.hands.human[idx]).filter(card => card);
    if (combo.length !== COMBO_SIZES.SMALL && combo.length !== COMBO_SIZES.LARGE) return state;
    
    // Check if 5-card combos are allowed (only after trump card is drawn)
    // Exception: can respond to a 5-card combo even if trump card not drawn
    if (combo.length === COMBO_SIZES.LARGE && !state.trumpCardDrawn) {
      const isRespondingTo5CardCombo = state.leadCard && isCombo(state.leadCard) && state.leadCard.length === COMBO_SIZES.LARGE;
      if (!isRespondingTo5CardCombo) {
        return { ...state, log: [...state.log, `5-card combos are locked until the trump card is drawn!`] };
      }
    }
    
    // When responding to a combo, use position-based matching
    if (state.leadCard && isCombo(state.leadCard)) {
      // Responding to combo - validate with position-based comparison
      if (!canBeatComboByPosition(state.leadCard, combo, state.trumpSuit)) {
        return { ...state, log: [...state.log, `Cannot beat lead combo - check your card positions!`] };
      }
    } else if (state.leadCard) {
      // Responding to a single card - combos are not allowed
      return { ...state, log: [...state.log, `Cannot play combo when responding to a single card - play a single card instead`] };
    } else {
      // Leading with combo - must be a valid combo
      if (!isCombo(combo)) {
        return { ...state, log: [...state.log, `Invalid combo: must have at least 2 cards of same rank (3-card) or 4 cards in pairs (5-card)`] };
      }
    }
    
    // Create new state with combo cards removed from hand
    const newHumanHand = removeCardsFromHand(state.hands.human, indices);
    const newPile = [...state.pile, ...combo];
    const newLastPlay = { ...state.lastPlay, human: combo };
    const newPlayedCards = [...state.playedCards, ...combo.map(card => ({ card, player: 'human' }))];
    
    // Add logging for combo play
    const comboLog = [...state.log, `You played combo (${combo.length} cards) - Pile: ${state.pile.length} -> ${newPile.length} cards`];
    
    // Check for win condition BEFORE drawing
    const newWinner = checkWinCondition(newHumanHand) ? 'human' : state.winner;
    
    // Draw cards to maintain hand size (but not if player already won)
    const { newDeck, newHand: newHumanHandAfterDraw, trumpCardWasDrawn } = newWinner
      ? { newDeck: [...state.deck], newHand: newHumanHand, trumpCardWasDrawn: false }
      : drawCardsToHandSize(state.deck, newHumanHand, state.trumpCard);
    
    if (state.leadCard) {
      // Human is responding - resolve the trick
      const humanWon = determineTrickWinner(state.leadCard, combo, state.trumpSuit);
      const winner = humanWon ? 'human' : 'bot';
      let newLog = [...comboLog, `You played combo and ${humanWon ? 'won' : 'lost'} the trick`];
      
      // Add trump card message if it was just drawn
      if (trumpCardWasDrawn && !state.trumpCardDrawn) {
        newLog = [...newLog, `You drew ${formatCard(state.trumpCard)} - 5-card combos are now allowed!`];
      }
      
      // Move all cards from pile to dead pile
      const newDeadPile = [...state.deadPile, ...newPile];
      
      return {
        ...state,
        deck: newDeck,
        pile: [],
        deadPile: newDeadPile,
        hands: { ...state.hands, human: newHumanHandAfterDraw },
        turn: winner,
        leadCard: null,
        lastPlay: newLastPlay,
        log: newLog,
        winner: newWinner,
        trumpCardDrawn: state.trumpCardDrawn || trumpCardWasDrawn
      };
    } else {
      // Human is leading with combo
      let newLog = [...comboLog, `You led combo`];
      
      // Add trump card message if it was just drawn
      if (trumpCardWasDrawn && !state.trumpCardDrawn) {
        newLog = [...newLog, `You drew ${formatCard(state.trumpCard)} - 5-card combos are now allowed!`];
      }
      
      return {
        ...state,
        deck: newDeck,
        pile: newPile,
        hands: { ...state.hands, human: newHumanHandAfterDraw },
        turn: 'bot',
        leadCard: combo,
        lastPlay: newLastPlay,
        log: newLog,
        winner: newWinner,
        trumpCardDrawn: state.trumpCardDrawn || trumpCardWasDrawn
      };
    }
  }
  case 'HUMAN_PICKUP': {
    if (!state.leadCard) {
      // Can't pick up when leading
      return { ...state, log: [...state.log, `Cannot pick up when leading`] };
    }
    
    // Human picks up the pile (always allowed when there's a lead card)
    const newHumanHand = [...state.hands.human, ...state.pile];
    const newLog = [...state.log, `You picked up ${state.pile.length} card(s) from the pile (Hand: ${state.hands.human.length} -> ${newHumanHand.length})`];
    
    return {
      ...state,
      hands: { ...state.hands, human: newHumanHand },
      pile: [],
      leadCard: null,
      turn: 'bot',
      log: newLog
    };
  }
  case 'HUMAN_EXCHANGE_TRUMP': {
    // Exchange 7 of trump for the trump card
    const sevenOfTrump = state.hands.human.find(card => 
      card.rank === '7' && card.suit === state.trumpSuit
    );
    
    if (!sevenOfTrump || !state.trumpCard) {
      return { ...state, log: [...state.log, `Cannot exchange: need 7 of trump and trump card must be available`] };
    }
    
    // Prevent exchange after deck is exhausted
    if (state.deck.length === 0) {
      return { ...state, log: [...state.log, `Cannot exchange: deck is exhausted - no more cards to draw`] };
    }
    
    const newHumanHand = state.hands.human.filter(card => card !== sevenOfTrump);
    newHumanHand.push(state.trumpCard);
    
    let newLog = [...state.log, `You exchanged 7${suitToIcon(state.trumpSuit)} for ${formatCard(state.trumpCard)}`];
    
    // Exchanging the trump card counts as drawing it
    if (!state.trumpCardDrawn) {
      newLog = [...newLog, `5-card combos are now allowed!`];
    }
    
    // Update deck to replace trump card at bottom with the 7
    const newDeck = [...state.deck];
    newDeck[0] = sevenOfTrump;
    
    return {
      ...state,
      deck: newDeck,
      hands: { ...state.hands, human: newHumanHand },
      trumpCard: sevenOfTrump,
      trumpCardDrawn: true, // Trump card is now in play
      log: newLog
    };
  }
  case 'BOT_ACT': {
    if (state.turn !== 'bot') return state;
    const choice = chooseBotResponse(state.leadCard, state.hands.bot, state.trumpSuit, state.trumpCardDrawn, state.hands.human.length, state.deck.length, state.difficulty, state.playedCards, state.pile);
    
    if (!choice) {
      // Bot picks up (only when responding, not when leading)
      if (!state.leadCard) return state;
      
      const newBotHand = [...state.hands.bot, ...state.pile];
      const newLog = [...state.log, `Bot picked up the pile`];
      
      return {
        ...state,
        hands: { ...state.hands, bot: newBotHand },
        pile: [],
        leadCard: null,
        turn: 'human',
        log: newLog
      };
    }
    
    // Bot plays a card
    const { newBotHand, newPile, newLastPlay, newLog, newPlayedCards } = playBotCard(state, choice);
    
    // Check for win condition BEFORE drawing
    const newWinner = checkWinCondition(newBotHand) ? 'bot' : state.winner;
    
    // Draw cards (but not if bot already won)
    const { newDeck, newHand: newBotHandAfterDraw, trumpCardWasDrawn } = newWinner
      ? { newDeck: [...state.deck], newHand: newBotHand, trumpCardWasDrawn: false }
      : drawCardsToHandSize(state.deck, newBotHand, state.trumpCard);
    
    if (state.leadCard) {
      // Bot is responding - resolve the trick
      const botWon = determineTrickWinner(state.leadCard, choice, state.trumpSuit);
      const winner = botWon ? 'bot' : 'human';
      let finalLog = [...newLog, `${winner === 'human' ? 'You' : 'Bot'} won the trick`];
      
      // Add trump card message if it was just drawn
      if (trumpCardWasDrawn && !state.trumpCardDrawn) {
        finalLog = [...finalLog, `Bot drew ${formatCard(state.trumpCard)} - 5-card combos are now allowed!`];
      }
      
      // Move all cards from pile to dead pile
      const newDeadPile = [...state.deadPile, ...newPile];
      
      if (winner === 'bot') {
        // Bot won the trick, immediately lead next
        return handleBotLead(
          { ...state, deck: newDeck, trumpCardDrawn: state.trumpCardDrawn || trumpCardWasDrawn },
          newBotHandAfterDraw,
          newDeadPile,
          finalLog
        );
      } else {
        // Human won the trick
        return {
          ...state,
          deck: newDeck,
          pile: [],
          deadPile: newDeadPile,
          hands: { ...state.hands, bot: newBotHandAfterDraw },
          turn: 'human',
          leadCard: null,
          lastPlay: newLastPlay,
          log: finalLog,
          winner: newWinner,
          trumpCardDrawn: state.trumpCardDrawn || trumpCardWasDrawn,
          playedCards: newPlayedCards
        };
      }
    } else {
      // Bot is leading
      let finalLog = [...newLog, `Bot leading (Human hand: ${state.hands.human.length} cards, Bot hand: ${newBotHandAfterDraw.length} cards)`];
      
      // Add trump card message if it was just drawn
      if (trumpCardWasDrawn && !state.trumpCardDrawn) {
        finalLog = [...finalLog, `Bot drew ${formatCard(state.trumpCard)} - 5-card combos are now allowed!`];
      }
      
      // If bot won by playing its last card, return the winning state immediately
      if (newWinner === 'bot') {
        return {
          ...state,
          deck: newDeck,
          pile: newPile,
          hands: { ...state.hands, bot: newBotHandAfterDraw },
          turn: 'bot', // Keep turn as bot since bot won
          leadCard: null, // Clear lead card since game is over
          lastPlay: newLastPlay,
          log: finalLog,
          winner: newWinner,
          trumpCardDrawn: state.trumpCardDrawn || trumpCardWasDrawn,
          playedCards: newPlayedCards
        };
      }
      
      return {
        ...state,
        deck: newDeck,
        pile: newPile,
        hands: { ...state.hands, bot: newBotHandAfterDraw },
        turn: 'human',
        leadCard: choice,
        lastPlay: newLastPlay,
        log: finalLog,
        winner: newWinner,
        trumpCardDrawn: state.trumpCardDrawn || trumpCardWasDrawn,
        playedCards: newPlayedCards
      };
    }
  }
  default:
    return state;
  }
}


