"use client";

import { useEffect, useMemo, useReducer, useState } from 'react';
import { formatCard, suitToIcon, sortCardsForDisplay, isTrump, canPlayCard, mustFollowSuit, canBeat, isCombo, canPlayCombo, canBeatComboByPosition } from '../../lib/huzur/cards';
import { gameReducer, initGame } from '../../lib/huzur/gameReducer';
import { COMBO_SIZES, DELAYS } from '../../lib/huzur/constants';
import ErrorBoundary from '../../components/ErrorBoundary';

function CardGameInner() {
  const [state, dispatch] = useReducer(gameReducer, null, () => null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [selectedCombo, setSelectedCombo] = useState([]);
  const [isClient, setIsClient] = useState(false);

  // Initialize game only on client side to avoid hydration mismatch
  useEffect(() => {
    setIsClient(true);
    dispatch({ type: 'RESET' });
  }, []);

  const playerHand = useMemo(() => {
    if (!state || !state.hands) return [];
    return sortCardsForDisplay(state.hands.human, state.trumpSuit);
  }, [state?.hands?.human, state?.trumpSuit]);

  useEffect(() => {
    if (state && state.turn === 'bot') {
      const t = setTimeout(() => dispatch({ type: 'BOT_ACT' }), DELAYS.BOT_TURN);
      return () => clearTimeout(t);
    }
  }, [state?.turn]);

  const onPlay = () => {
    if (!state) return;
    
    // Handle combo play (3 or 5 cards)
    if (selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) {
      if (!isCombo(selectedCombo)) {
        setSelectedCombo([]);
        return;
      }
      const realIndices = selectedCombo.map(card => 
        state.hands.human.findIndex(c => c === card)
      ).filter(idx => idx >= 0);
      
      if (realIndices.length === selectedCombo.length) {
        dispatch({ type: 'HUMAN_PLAY_COMBO', indices: realIndices });
        setSelectedCombo([]);
      }
      return;
    }
    
    // Handle single card play
    if (selectedIdx == null) return;
    const card = playerHand[selectedIdx];
    const realIndex = state.hands.human.findIndex(c => c === card);
    if (realIndex >= 0) {
      dispatch({ type: 'HUMAN_PLAY', index: realIndex });
      setSelectedIdx(null);
    }
  };

  const onBeatCombo = () => {
    if (!state || !state.leadCard || !isCombo(state.leadCard)) return;
    
    // Play selected cards to beat the combo (doesn't need to be a valid combo)
    if (selectedCombo.length !== state.leadCard.length) {
      return; // Must match the size
    }
    
    const realIndices = selectedCombo.map(card => 
      state.hands.human.findIndex(c => c === card)
    ).filter(idx => idx >= 0);
    
    if (realIndices.length === selectedCombo.length) {
      dispatch({ type: 'HUMAN_PLAY_COMBO', indices: realIndices });
      setSelectedCombo([]);
    }
  };

  const onPickup = () => {
    if (!state) return;
    dispatch({ type: 'HUMAN_PICKUP' });
    setSelectedIdx(null);
    setSelectedCombo([]);
  };

  // Handle card selection for combos
  const handleCardClick = (idx) => {
    const card = playerHand[idx];
    
    // Check if responding to a single card - if so, combos are not allowed
    const isRespondingToSingleCard = state?.leadCard && !isCombo(state.leadCard);
    
    // Check if card is already in combo - if so, deselect it
    if (selectedCombo.some(c => c === card)) {
      setSelectedCombo(selectedCombo.filter(c => c !== card));
      return;
    }
    
    // Check if this is already the selected single card - if so, deselect it
    if (selectedIdx === idx) {
      setSelectedIdx(null);
      return;
    }
    
    // If responding to a single card, only allow single card selection
    if (isRespondingToSingleCard) {
      setSelectedIdx(idx);
      setSelectedCombo([]);
      return;
    }
    
    if (selectedCombo.length > 0) {
      // If building a combo, add to combo (up to 5 cards for 5-card combos)
      // But only allow 5-card combos if trump card has been drawn (or responding to a 5-card combo)
      const isRespondingTo5CardCombo = state?.leadCard && isCombo(state.leadCard) && state.leadCard.length === COMBO_SIZES.LARGE;
      const maxSize = isRespondingTo5CardCombo ? COMBO_SIZES.LARGE : 
                      (state?.trumpCardDrawn ? COMBO_SIZES.LARGE : COMBO_SIZES.SMALL);
      
      if (selectedCombo.length < maxSize) {
        setSelectedCombo([...selectedCombo, card]);
        setSelectedIdx(null);
      }
    } else if (selectedIdx !== null) {
      // Have a single card selected, start a combo with both cards
      const firstCard = playerHand[selectedIdx];
      setSelectedCombo([firstCard, card]);
      setSelectedIdx(null);
    } else {
      // No selection - select as single card
      setSelectedIdx(idx);
    }
  };

  // Handle keyboard events for card selection
  const handleCardKeyDown = (e, idx) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(idx);
    }
  };

  // Get suit name for screen readers
  const getSuitName = (suit) => {
    const suitNames = { H: 'Hearts', S: 'Spades', D: 'Diamonds', C: 'Clubs' };
    return suitNames[suit] || '';
  };

  // Get card description for screen readers
  const getCardDescription = (card) => {
    if (card.rank === 'BJ') return 'Black Joker';
    if (card.rank === 'RJ') return 'Red Joker';
    return `${card.rank} of ${getSuitName(card.suit)}`;
  };

  // Check if pickup is allowed
  const canPickup = state && state.leadCard;
  const mustPickup = state && state.leadCard && mustFollowSuit(state.leadCard, state.hands.human) && !state.hands.human.some(card => canBeat(state.leadCard, card, state.trumpSuit));
  
  // Check if current selection is valid
  const isValidPlay = () => {
    if (selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) {
      // If responding to a combo, check if cards beat it (using position-based matching)
      if (state.leadCard && isCombo(state.leadCard)) {
        return canBeatComboByPosition(state.leadCard, selectedCombo, state.trumpSuit);
      }
      // If leading or responding to single card, must be a valid combo
      if (!isCombo(selectedCombo)) return false;
      return canPlayCombo(state.leadCard, selectedCombo, state.hands.human, state.trumpSuit);
    }
    if (selectedIdx != null) {
      return canPlayCard(state.leadCard, playerHand[selectedIdx], state.hands.human, state.trumpSuit);
    }
    return false;
  };

  // Check if "Beat Combo" button should be enabled
  const canBeatComboNow = () => {
    if (!state?.leadCard || !isCombo(state.leadCard)) return false;
    if (selectedCombo.length !== state.leadCard.length) return false;
    return canBeatComboByPosition(state.leadCard, selectedCombo, state.trumpSuit);
  };

  const onReset = () => {
    dispatch({ type: 'RESET' });
    setSelectedIdx(null);
    setSelectedCombo([]);
  };

  const onExchangeTrump = () => {
    if (!state) return;
    dispatch({ type: 'HUMAN_EXCHANGE_TRUMP' });
  };

  // Check if player can exchange trump
  const canExchangeTrump = state && state.trumpCard && state.hands.human.some(card => 
    card.rank === '7' && card.suit === state.trumpSuit
  );

  // Show loading state until client-side initialization
  if (!isClient || !state) {
    return (
      <div className="font-sans min-h-screen p-6 sm:p-10">
        <main className="flex flex-col gap-6 items-center w-full max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold">Huzur (MVP)</h1>
          <div className="text-center">Loading game...</div>
        </main>
      </div>
    );
  }

  const trumpIcon = suitToIcon(state.trumpSuit);
  const isRespondingToCombo = state.leadCard && isCombo(state.leadCard);

  return (
    <div className="font-sans min-h-screen p-6 sm:p-10">
      <main className="flex flex-col gap-6 items-center w-full max-w-3xl mx-auto">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-2xl font-bold">Huzur (MVP)</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm">Trump: <span className="text-lg">{trumpIcon}</span></span>
            {state.trumpCard && (
              <span className="text-xs text-gray-600">
                Under deck: {formatCard(state.trumpCard)}
              </span>
            )}
            {!state.trumpCardDrawn && (
              <span className="text-xs px-2 py-1 bg-orange-100 border border-orange-300 rounded">
                🔒 5-card combos locked
              </span>
            )}
            {state.trumpCardDrawn && (
              <span className="text-xs px-2 py-1 bg-green-100 border border-green-300 rounded">
                🔓 5-card combos unlocked
              </span>
            )}
            <button className="px-3 py-1 border rounded" onClick={onReset}>Reset</button>
          </div>
        </div>

        {/* Deck indicator */}
        <section className="w-full flex flex-col items-center gap-2">
          <div className="text-sm font-medium">Deck</div>
          <div className="flex items-center gap-3">
            <div className="relative">
              {/* Stack of cards visual */}
              <div className="w-12 h-16 bg-blue-600 rounded border-2 border-blue-800 shadow-lg flex items-center justify-center">
                <span className="text-white text-xs font-bold">{state.deck.length}</span>
              </div>
              {/* Additional cards in stack for visual effect */}
              {state.deck.length > 1 && (
                <div className="absolute top-1 left-1 w-12 h-16 bg-blue-500 rounded border border-blue-700 opacity-75"></div>
              )}
              {state.deck.length > 2 && (
                <div className="absolute top-2 left-2 w-12 h-16 bg-blue-400 rounded border border-blue-600 opacity-50"></div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-sm text-gray-600">
                {state.deck.length} card{state.deck.length !== 1 ? 's' : ''} remaining
              </div>
              {/* Progress bar showing deck depletion */}
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(state.deck.length / 32) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
          {state.deck.length === 0 && (
            <div className="text-xs text-red-600 font-medium">
              Deck is empty - no more cards to draw!
            </div>
          )}
          {state.deck.length === 1 && !state.trumpCardDrawn && (
            <div className="text-xs text-yellow-600 font-medium">
              ⚠️ Next card is the trump card: {formatCard(state.trumpCard)}
            </div>
          )}
        </section>

        <section className="w-full flex flex-col items-center gap-2">
          <div className="text-sm">Bot hand: {state.hands.bot.length} cards</div>
          <div className="flex gap-1 opacity-60">
            {Array.from({ length: state.hands.bot.length }).map((_, i) => (
              <div key={i} className="w-6 h-8 bg-gray-300 rounded border" />
            ))}
          </div>
        </section>

        <section className="w-full flex flex-col items-center gap-3">
          <div className="text-sm">Center</div>
          <div className="min-h-16 w-full flex items-center justify-center gap-4 border rounded p-3">
            {state.leadCard ? (
              <div className="px-3 py-2 border rounded bg-white">
                Lead: {Array.isArray(state.leadCard) ? (
                  <span className="flex gap-1">
                    {state.leadCard.map((card, idx) => (
                      <span key={idx}>{formatCard(card)}</span>
                    ))}
                  </span>
                ) : formatCard(state.leadCard)}
                {state.lastPlay.bot && (
                  <span className="ml-2 text-xs text-blue-600">(Bot led)</span>
                )}
                {state.lastPlay.human && (
                  <span className="ml-2 text-xs text-green-600">(You led)</span>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-sm">No active trick</div>
            )}
          </div>
          <div className="w-full text-xs max-h-32 overflow-auto border rounded p-2 bg-gray-50">
            {state.log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </section>

        {state.deadPile && state.deadPile.length > 0 && (
          <section className="w-full flex flex-col items-center gap-2">
            <div className="text-sm">Dead Pile ({state.deadPile.length} cards)</div>
            <div className="flex flex-wrap gap-1 justify-center max-h-20 overflow-auto">
              {state.deadPile.map((card, idx) => (
                <div
                  key={`dead-${card.rank}-${card.suit}-${idx}`}
                  className="px-2 py-1 text-xs border rounded bg-gray-100 opacity-75"
                >
                  {formatCard(card)}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="w-full flex flex-col items-center gap-2">
          <div className="text-sm">Your hand ({playerHand.length})</div>
          {selectedCombo.length > 0 && (
            <div className="text-xs text-blue-600">
              {isRespondingToCombo ? (
                <div className="flex flex-col items-center gap-1">
                  <div>Beat combo: {selectedCombo.length}/{state.leadCard.length}</div>
                  <div className="flex gap-2 text-[10px]">
                    {selectedCombo.map((card, i) => (
                      <span key={i} className={canBeat(state.leadCard[i], card, state.trumpSuit) ? 'text-green-600' : 'text-red-600'}>
                        {formatCard(card)} vs {formatCard(state.leadCard[i])} {canBeat(state.leadCard[i], card, state.trumpSuit) ? '✓' : '✗'}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  Combo: {selectedCombo.length}/{selectedCombo.length <= COMBO_SIZES.SMALL ? COMBO_SIZES.SMALL : COMBO_SIZES.LARGE} {isCombo(selectedCombo) ? '✓ Valid' : '✗ Invalid'}
                  {selectedCombo.length > COMBO_SIZES.SMALL && !state.trumpCardDrawn && (
                    <span className="ml-2 text-orange-600">🔒 5-card locked</span>
                  )}
                </>
              )}
            </div>
          )}
          {state.leadCard && !isCombo(state.leadCard) && (
            <div className="text-xs text-orange-600 font-medium">
              ⚠️ Responding to single card - only single cards allowed (no combos)
            </div>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            {playerHand.map((c, idx) => {
              const isSelected = selectedIdx === idx;
              const isInCombo = selectedCombo.some(card => card === c);
              const cardDescription = getCardDescription(c);
              const isTrumpCard = isTrump(c, state.trumpSuit);
              
              return (
                <button
                  key={`${c.rank}-${c.suit}-${idx}`}
                  onClick={() => handleCardClick(idx)}
                  onKeyDown={(e) => handleCardKeyDown(e, idx)}
                  aria-label={`${cardDescription}${isTrumpCard ? ', Trump card' : ''}${isSelected ? ', Selected' : ''}${isInCombo ? ', In combo' : ''}`}
                  aria-pressed={isSelected || isInCombo}
                  className={`px-3 py-2 rounded border ${
                    isSelected ? 'ring-2 ring-blue-500' : 
                    isInCombo ? 'ring-2 ring-green-500 bg-green-50' : ''
                  } ${isTrumpCard ? 'bg-yellow-50' : 'bg-white'} hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-400`}
                >
                  {formatCard(c)}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3" role="group" aria-label="Game actions">
            {isRespondingToCombo ? (
              // Special button for beating combos
              <button 
                className="px-4 py-2 border rounded bg-purple-50 border-purple-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-100 transition" 
                onClick={onBeatCombo} 
                disabled={!canBeatComboNow()}
                aria-label={`Beat combo with ${selectedCombo.length} cards`}
              >
                Beat Combo ({selectedCombo.length}/{state.leadCard.length})
              </button>
            ) : (
              // Regular play button
              <button 
                className="px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition" 
                onClick={onPlay} 
                disabled={!isValidPlay()}
                aria-label={(selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) ? 'Play selected combo' : 'Play selected card'}
              >
                {(selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) ? 'Play Combo' : 'Play'}
              </button>
            )}
            <button 
              className={`px-4 py-2 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition ${mustPickup ? 'bg-red-100 border-red-300' : ''}`}
              onClick={onPickup}
              disabled={!canPickup && !mustPickup}
              aria-label={mustPickup ? 'Pick up pile (required)' : 'Pick up pile'}
            >
              {mustPickup ? 'Must Pick Up' : 'Pick Up'}
            </button>
            {canExchangeTrump && (
              <button 
                className="px-4 py-2 border rounded bg-yellow-50 border-yellow-300 hover:bg-yellow-100 transition" 
                onClick={onExchangeTrump}
                aria-label={`Exchange 7 of ${getSuitName(state.trumpSuit)} for trump card`}
              >
                Exchange 7{trumpIcon}
              </button>
            )}
          </div>
        </section>

        {state.winner && (
          <div className="w-full p-3 border rounded bg-green-50 text-center">
            {state.winner === 'human' ? 'You win!' : 'Bot wins!'}
          </div>
        )}
      </main>
    </div>
  );
}

export default function CardGame() {
  return (
    <ErrorBoundary>
      <CardGameInner />
    </ErrorBoundary>
  );
}
