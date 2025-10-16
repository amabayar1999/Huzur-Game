import { createDeck, jokerToTrumpSuit, isJoker, formatCard, sortCardsForDisplay, canBeat, canPlayCard, mustFollowSuit, isCombo, canPlayCombo, canBeatCombo, canBeatComboDebug, getComboPlayOrder, suitToIcon } from './cards';
import { chooseBotResponse } from './bot';

function deal(deck, count) {
  const hand = [];
  for (let i = 0; i < count && deck.length > 0; i++) {
    hand.push(deck.pop());
  }
  return hand;
}

export function initGame() {
  const deck = createDeck();
  const human = deal(deck, 5);
  const bot = deal(deck, 5);
  const trumpCard = deck.pop(); // Trump card stays under deck
  let trumpSuit = trumpCard?.suit || jokerToTrumpSuit(trumpCard);
  const log = [];
  log.push(`Trump is ${trumpSuit || 'None'} from ${formatCard(trumpCard)} (card remains under deck)`);
  return {
    deck,
    trumpCard, // Keep trump card separate
    pile: [],
    deadPile: [],
    trumpSuit: trumpSuit || 'H',
    hands: { human, bot },
    turn: 'human',
    leadCard: null,
    lastPlay: {},
    winner: null,
    log,
  };
}


export function gameReducer(state, action) {
  // Handle uninitialized state safely (e.g., before client-side RESET)
  if (state == null) {
    if (action && action.type === 'RESET') return initGame();
    return state;
  }
  if (state.winner) return state;
  switch (action.type) {
  case 'RESET': {
    return initGame();
  }
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
    const newHumanHand = [...state.hands.human];
    newHumanHand.splice(idx, 1);
    const newPile = [...state.pile, card];
    const newLastPlay = { ...state.lastPlay, human: card };
    
    // Draw cards to maintain 5 cards until deck is exhausted
    const newDeck = [...state.deck];
    const newHumanHandAfterDraw = [...newHumanHand];
    while (newDeck.length > 0 && newHumanHandAfterDraw.length < 5) {
      newHumanHandAfterDraw.push(newDeck.pop());
    }
    
    if (state.leadCard) {
      // Human is responding - resolve the trick
      const humanWon = canBeat(state.leadCard, card, state.trumpSuit);
      const winner = humanWon ? 'human' : 'bot';
      const newLog = [...state.log, `You played ${formatCard(card)} and ${humanWon ? 'won' : 'lost'} the trick`];
      
      // Move all cards from pile to dead pile
      const newDeadPile = [...state.deadPile, ...newPile];
      
      // Check for win condition
      let newWinner = state.winner;
      if (newHumanHandAfterDraw.length === 0) newWinner = 'human';
      
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
        winner: newWinner
      };
    } else {
      // Human is leading
      const newLog = [...state.log, `You led ${formatCard(card)}`];
      return {
        ...state,
        deck: newDeck,
        pile: newPile,
        hands: { ...state.hands, human: newHumanHandAfterDraw },
        turn: 'bot',
        leadCard: card,
        lastPlay: newLastPlay,
        log: newLog
      };
    }
  }
  case 'HUMAN_PLAY_COMBO': {
    const indices = action.indices;
    const combo = indices.map(idx => state.hands.human[idx]).filter(card => card);
    if (combo.length !== 3 && combo.length !== 5) return state;
    
    // Validate the combo
    if (!isCombo(combo)) {
      return { ...state, log: [...state.log, `Invalid combo: must be 2 same numbers + any other card`] };
    }
    
    if (!canPlayCombo(state.leadCard, combo, state.hands.human, state.trumpSuit)) {
      if (state.leadCard && isCombo(state.leadCard)) {
        // Get detailed debug info for combo vs combo
        const debug = canBeatComboDebug(state.leadCard, combo, state.trumpSuit);
        if (debug.reason === 'Different combo sizes') {
          return { ...state, log: [...state.log, `Cannot play ${combo.length}-card combo against ${state.leadCard.length}-card combo`] };
        } else if (debug.reason.includes('Card')) {
          return { ...state, log: [...state.log, `Combo cannot beat lead combo: ${debug.reason}`] };
        } else {
          return { ...state, log: [...state.log, `Must play a combo that beats the lead combo: ${debug.reason}`] };
        }
      } else if (state.leadCard) {
        return { ...state, log: [...state.log, `Must play a combo that beats ${formatCard(state.leadCard)}`] };
      }
      return { ...state, log: [...state.log, `Invalid combo play`] };
    }
    
    // Create new state with combo cards removed from hand
    const newHumanHand = [...state.hands.human];
    // Remove cards in reverse order to maintain correct indices
    indices.sort((a, b) => b - a).forEach(idx => newHumanHand.splice(idx, 1));
    const newPile = [...state.pile, ...combo];
    const newLastPlay = { ...state.lastPlay, human: combo };
    
    // Draw cards to maintain 5 cards until deck is exhausted
    const newDeck = [...state.deck];
    const newHumanHandAfterDraw = [...newHumanHand];
    while (newDeck.length > 0 && newHumanHandAfterDraw.length < 5) {
      newHumanHandAfterDraw.push(newDeck.pop());
    }
    
    if (state.leadCard) {
      // Human is responding - resolve the trick
      let humanWon;
      if (isCombo(state.leadCard)) {
        humanWon = canBeatCombo(state.leadCard, combo, state.trumpSuit);
        } else {
          // Single card vs combo - combo wins if highest card beats the single card
          const sortedCombo = getComboPlayOrder(combo, state.trumpSuit);
          humanWon = canBeat(state.leadCard, sortedCombo[sortedCombo.length - 1], state.trumpSuit); // Highest card
        }
      const winner = humanWon ? 'human' : 'bot';
      const newLog = [...state.log, `You played combo and ${humanWon ? 'won' : 'lost'} the trick`];
      
      // Move all cards from pile to dead pile
      const newDeadPile = [...state.deadPile, ...newPile];
      
      // Check for win condition
      let newWinner = state.winner;
      if (newHumanHandAfterDraw.length === 0) newWinner = 'human';
      
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
        winner: newWinner
      };
    } else {
      // Human is leading with combo
      const newLog = [...state.log, `You led combo`];
      return {
        ...state,
        deck: newDeck,
        pile: newPile,
        hands: { ...state.hands, human: newHumanHandAfterDraw },
        turn: 'bot',
        leadCard: combo,
        lastPlay: newLastPlay,
        log: newLog
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
    const newLog = [...state.log, `You picked up the pile - your turn is skipped`];
    
    // Check for win condition
    let newWinner = state.winner;
    if (newHumanHand.length === 0) newWinner = 'human';
    
    return {
      ...state,
      hands: { ...state.hands, human: newHumanHand },
      pile: [],
      leadCard: null,
      turn: 'bot',
      log: newLog,
      winner: newWinner
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
    
    const newHumanHand = state.hands.human.filter(card => card !== sevenOfTrump);
    newHumanHand.push(state.trumpCard);
    
    const newLog = [...state.log, `You exchanged 7${suitToIcon(state.trumpSuit)} for ${formatCard(state.trumpCard)}`];
    
    return {
      ...state,
      hands: { ...state.hands, human: newHumanHand },
      trumpCard: sevenOfTrump,
      log: newLog
    };
  }
  case 'BOT_ACT': {
    if (state.turn !== 'bot') return state;
    const choice = chooseBotResponse(state.leadCard, state.hands.bot, state.trumpSuit);
    if (choice) {
      let newBotHand, newPile, newLastPlay, newLog;
      
      if (Array.isArray(choice)) {
        // Bot played a combo
        const combo = choice;
        const indices = combo.map(card => state.hands.bot.findIndex(c => c === card)).filter(idx => idx >= 0);
        newBotHand = [...state.hands.bot];
        // Remove cards in reverse order to maintain correct indices
        indices.sort((a, b) => b - a).forEach(idx => newBotHand.splice(idx, 1));
        newPile = [...state.pile, ...combo];
        newLastPlay = { ...state.lastPlay, bot: combo };
        newLog = [...state.log, `Bot played combo`];
      } else {
        // Bot played a single card
        const idx = state.hands.bot.findIndex(c => c === choice);
        newBotHand = [...state.hands.bot];
        newBotHand.splice(idx, 1);
        newPile = [...state.pile, choice];
        newLastPlay = { ...state.lastPlay, bot: choice };
        newLog = [...state.log, `Bot played ${formatCard(choice)}`];
      }
      
      // Draw cards to maintain 5 cards until deck is exhausted
      const newDeck = [...state.deck];
      const newBotHandAfterDraw = [...newBotHand];
      while (newDeck.length > 0 && newBotHandAfterDraw.length < 5) {
        newBotHandAfterDraw.push(newDeck.pop());
      }
      
      if (state.leadCard) {
        // Bot is responding - resolve the trick
        let botWon;
        if (Array.isArray(choice)) {
          // Bot played combo
          if (isCombo(state.leadCard)) {
            botWon = canBeatCombo(state.leadCard, choice, state.trumpSuit);
            } else {
              // Single card vs combo - combo wins if highest card beats the single card
              const sortedCombo = getComboPlayOrder(choice, state.trumpSuit);
              botWon = canBeat(state.leadCard, sortedCombo[sortedCombo.length - 1], state.trumpSuit); // Highest card
            }
        } else {
          // Bot played single card
          if (isCombo(state.leadCard)) {
            // Combo vs single card - combo wins
            botWon = false;
          } else {
            botWon = canBeat(state.leadCard, choice, state.trumpSuit);
          }
        }
        const winner = botWon ? 'bot' : 'human';
        const finalLog = [...newLog, `${winner === 'human' ? 'You' : 'Bot'} won the trick`];
        
        // Move all cards from pile to dead pile
        const newDeadPile = [...state.deadPile, ...newPile];
        
        // Check for win condition
        let newWinner = state.winner;
        if (newBotHandAfterDraw.length === 0) newWinner = 'bot';
        
        if (winner === 'bot') {
          // Bot won the trick, they should lead next
          // Immediately handle the bot's next lead
          const nextChoice = chooseBotResponse(null, newBotHandAfterDraw, state.trumpSuit);
          if (nextChoice) {
            let finalBotHand, finalPile, finalLastPlay, finalLogWithLead;
            
            if (Array.isArray(nextChoice)) {
              // Bot led with combo
              const combo = nextChoice;
              const indices = combo.map(card => newBotHandAfterDraw.findIndex(c => c === card)).filter(idx => idx >= 0);
              finalBotHand = [...newBotHandAfterDraw];
              indices.sort((a, b) => b - a).forEach(idx => finalBotHand.splice(idx, 1));
              finalPile = [...combo];
              finalLastPlay = { ...newLastPlay, bot: combo };
              finalLogWithLead = [...finalLog, `Bot led combo`];
            } else {
              // Bot led with single card
              const nextIdx = newBotHandAfterDraw.findIndex(c => c === nextChoice);
              finalBotHand = [...newBotHandAfterDraw];
              finalBotHand.splice(nextIdx, 1);
              finalPile = [nextChoice];
              finalLastPlay = { ...newLastPlay, bot: nextChoice };
              finalLogWithLead = [...finalLog, `Bot led ${formatCard(nextChoice)}`];
            }
            
            // Draw cards to maintain 5 cards until deck is exhausted
            const finalDeck = [...newDeck];
            const finalBotHandAfterDraw = [...finalBotHand];
            while (finalDeck.length > 0 && finalBotHandAfterDraw.length < 5) {
              finalBotHandAfterDraw.push(finalDeck.pop());
            }
            
            return {
              ...state,
              deck: finalDeck,
              pile: finalPile,
              deadPile: newDeadPile,
              hands: { ...state.hands, bot: finalBotHandAfterDraw },
              turn: 'human',
              leadCard: nextChoice,
              lastPlay: finalLastPlay,
              log: finalLogWithLead,
              winner: newWinner
            };
          } else {
            // Bot can't lead (shouldn't happen), pass turn to human
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
              winner: newWinner
            };
          }
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
            winner: newWinner
          };
        }
      } else {
        // Bot is leading
        const finalLog = [...newLog, Array.isArray(choice) ? `Bot led combo` : `Bot led ${formatCard(choice)}`];
        return {
          ...state,
          deck: newDeck,
          pile: newPile,
          hands: { ...state.hands, bot: newBotHandAfterDraw },
          turn: 'human',
          leadCard: choice,
          lastPlay: newLastPlay,
          log: finalLog
        };
      }
    } else {
      // Bot picks up (only when responding, not when leading)
      if (!state.leadCard) return state; // Can't pick up when leading
      
      const newBotHand = [...state.hands.bot, ...state.pile];
      const newLog = [...state.log, `Bot picked up the pile`];
      
      // Check for win condition
      let newWinner = state.winner;
      if (newBotHand.length === 0) newWinner = 'bot';
      
      return {
        ...state,
        hands: { ...state.hands, bot: newBotHand },
        pile: [],
        leadCard: null,
        turn: 'human',
        log: newLog,
        winner: newWinner
      };
    }
  }
  default:
    return state;
  }
}


