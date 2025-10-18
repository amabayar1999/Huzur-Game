"use client";

import { useEffect, useMemo, useReducer, useState } from 'react';
import { formatCard, suitToIcon, sortCardsForDisplay, isTrump, canPlayCard, mustFollowSuit, canBeat, isCombo, canPlayCombo, canBeatComboByPosition } from '../../lib/huzur/cards';
import { gameReducer, initGame } from '../../lib/huzur/gameReducer';
import { COMBO_SIZES, DELAYS } from '../../lib/huzur/constants';
import ErrorBoundary from '../../components/ErrorBoundary';

function CardGameInner() {
  const [state, dispatch] = useReducer(gameReducer, null, initGame);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [selectedCombo, setSelectedCombo] = useState([]);
  const [isClient, setIsClient] = useState(false);

  // Initialize game only on client side to avoid hydration mismatch
  useEffect(() => {
    setIsClient(true);
    // Only dispatch RESET if state is null (initial load)
    if (!state) {
      dispatch({ type: 'RESET' });
    }
  }, [state]);

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
    // Clear selections first
    setSelectedIdx(null);
    setSelectedCombo([]);
    // Then reset the game state
    dispatch({ type: 'RESET' });
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
    <div className="font-sans min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 p-6 sm:p-10">
      <main className="flex flex-col gap-6 items-center w-full max-w-4xl mx-auto">
        <div className="w-full bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🃏 Huzur
              </h1>
              <span className={`px-3 py-1 text-sm font-semibold rounded-full shadow-sm ${
                state.turn === 'human' 
                  ? 'bg-green-100 text-green-800 border border-green-200' 
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}>
                {state.turn === 'human' ? '🎯 Your Turn' : '🤖 Bot Turn'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <span className="text-sm font-medium text-yellow-800">Trump:</span>
                <span className="text-xl">{trumpIcon}</span>
              </div>
              {state.trumpCard && (
                <div className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs text-gray-700">
                  Under deck: {formatCard(state.trumpCard)}
                </div>
              )}
              {!state.trumpCardDrawn && (
                <span className="text-xs px-3 py-1 bg-orange-100 border border-orange-300 rounded-full font-medium">
                  🔒 5-card combos locked
                </span>
              )}
              {state.trumpCardDrawn && (
                <span className="text-xs px-3 py-1 bg-green-100 border border-green-300 rounded-full font-medium">
                  🔓 5-card combos unlocked
                </span>
              )}
              <button 
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed" 
                onClick={onReset}
                disabled={!isClient}
              >
                🔄 Reset
              </button>
            </div>
          </div>
        </div>

        {/* Turn indicator */}
        <section className="w-full flex justify-center">
          <div className={`px-8 py-4 rounded-2xl border-2 font-bold text-xl transition-all duration-500 transform hover:scale-105 ${
            state.turn === 'human' 
              ? 'bg-gradient-to-r from-green-100 to-emerald-100 border-green-400 text-green-800 shadow-xl shadow-green-200 animate-pulse' 
              : 'bg-gradient-to-r from-blue-100 to-cyan-100 border-blue-400 text-blue-800 shadow-xl shadow-blue-200'
          }`}>
            {state.turn === 'human' ? '🎯 Your Turn - Make Your Move!' : '🤖 Bot\'s Turn - Thinking...'}
          </div>
        </section>


        <section className="w-full bg-white/60 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-4">
          <div className="flex flex-col items-center gap-3">
            <div className="text-lg font-bold text-gray-800">🤖 Bot Hand: {state.hands.bot.length} cards</div>
            <div className="flex gap-2 justify-center flex-wrap">
              {Array.from({ length: state.hands.bot.length }).map((_, i) => (
                <div key={i} className="w-8 h-12 bg-gradient-to-br from-gray-300 to-gray-400 rounded-lg border-2 border-gray-500 shadow-md transform hover:scale-105 transition-transform" />
              ))}
            </div>
          </div>
        </section>

        {/* Play Area - Between Bot and Player Hands */}
        <section className="w-full bg-white/60 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6">
          <div className="flex flex-col items-center gap-6">
            <div className="text-xl font-bold text-gray-800">🎯 Play Area</div>
            <div className="w-full flex items-center justify-between gap-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border-2 border-dashed border-blue-200 p-8 min-h-32">
              {/* Dead Pile - Left Side */}
              <div className="flex flex-col items-center gap-2">
                <div className="text-sm font-semibold text-gray-700">💀 Dead Pile</div>
                {state.deadPile && state.deadPile.length > 0 ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-16 bg-gradient-to-br from-gray-400 to-gray-600 rounded-lg border-2 border-gray-700 shadow-lg flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{state.deadPile.length}</span>
                    </div>
                    <div className="text-xs text-gray-600 text-center">
                      {state.deadPile.length} card{state.deadPile.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                ) : (
                  <div className="w-12 h-16 bg-gray-200 rounded-lg border-2 border-dashed border-gray-400 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">0</span>
                  </div>
                )}
              </div>

              {/* Center - Lead Card */}
              <div className="flex-1 flex items-center justify-center">
                {state.leadCard ? (
                  <div className="px-6 py-4 bg-white rounded-xl shadow-lg border-2 border-blue-300">
                    <div className="text-sm font-semibold text-gray-600 mb-2 text-center">Lead Card:</div>
                    <div className="flex items-center gap-2 justify-center">
                      {Array.isArray(state.leadCard) ? (
                        <div className="flex gap-1">
                          {state.leadCard.map((card, idx) => (
                            <span key={idx} className="px-2 py-1 bg-blue-100 border border-blue-300 rounded text-sm font-medium">
                              {formatCard(card)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="px-4 py-2 bg-blue-100 border border-blue-300 rounded-lg text-lg font-bold">
                          {formatCard(state.leadCard)}
                        </span>
                      )}
                      {state.lastPlay.bot && (
                        <span className="ml-2 text-xs text-blue-600 font-medium bg-blue-100 px-2 py-1 rounded">(Bot led)</span>
                      )}
                      {state.lastPlay.human && (
                        <span className="ml-2 text-xs text-green-600 font-medium bg-green-100 px-2 py-1 rounded">(You led)</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 text-lg font-medium">No active trick - waiting for lead</div>
                )}
              </div>

              {/* Deck - Right Side */}
              <div className="flex flex-col items-center gap-2">
                <div className="text-sm font-semibold text-gray-700">🃏 Deck</div>
                <div className="flex flex-col items-center gap-1">
                  <div className="relative">
                    {/* Stack of cards visual */}
                    <div className="w-12 h-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg border-2 border-blue-900 shadow-lg flex items-center justify-center">
                      <span className="text-white text-sm font-bold">{state.deck.length}</span>
                    </div>
                    {/* Additional cards in stack for visual effect */}
                    {state.deck.length > 1 && (
                      <div className="absolute top-1 left-1 w-12 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg border border-blue-800 opacity-75"></div>
                    )}
                    {state.deck.length > 2 && (
                      <div className="absolute top-2 left-2 w-12 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg border border-blue-700 opacity-50"></div>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 text-center">
                    {state.deck.length} card{state.deck.length !== 1 ? 's' : ''}
                  </div>
                  {/* Progress bar showing deck depletion */}
                  <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 rounded-full"
                      style={{ width: `${(state.deck.length / 32) * 100}%` }}
                    ></div>
                  </div>
                </div>
                {state.deck.length === 0 && (
                  <div className="text-xs text-red-600 font-bold bg-red-50 px-2 py-1 rounded border border-red-200 text-center">
                    ⚠️ Empty!
                  </div>
                )}
                {state.deck.length === 1 && !state.trumpCardDrawn && (
                  <div className="text-xs text-yellow-600 font-bold bg-yellow-50 px-2 py-1 rounded border border-yellow-200 text-center">
                    ⚠️ Trump next!
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>



        <section className="w-full bg-white/60 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-4">
          <div className="flex flex-col items-center gap-4">
            <div className="text-lg font-bold text-gray-800">🃏 Your Hand ({playerHand.length} cards)</div>
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
          <div className="flex flex-wrap gap-3 justify-center">
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
                  className={`px-4 py-3 rounded-xl border-2 font-bold text-lg transition-all duration-200 transform hover:scale-105 hover:-translate-y-1 ${
                    isSelected ? 'ring-4 ring-blue-400 bg-blue-100 border-blue-500 shadow-xl' : 
                    isInCombo ? 'ring-4 ring-green-400 bg-green-100 border-green-500 shadow-xl' : 
                    'bg-white border-gray-300 shadow-md hover:shadow-lg'
                  } ${isTrumpCard ? 'bg-gradient-to-br from-yellow-100 to-yellow-200 border-yellow-400' : ''} focus:outline-none focus:ring-4 focus:ring-blue-400`}
                >
                  {formatCard(c)}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 flex-wrap justify-center" role="group" aria-label="Game actions">
            {isRespondingToCombo ? (
              // Special button for beating combos
              <button 
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all duration-200" 
                onClick={onBeatCombo} 
                disabled={!canBeatComboNow()}
                aria-label={`Beat combo with ${selectedCombo.length} cards`}
              >
                ⚔️ Beat Combo ({selectedCombo.length}/{state.leadCard.length})
              </button>
            ) : (
              // Regular play button
              <button 
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all duration-200" 
                onClick={onPlay} 
                disabled={!isValidPlay()}
                aria-label={(selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) ? 'Play selected combo' : 'Play selected card'}
              >
                {(selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) ? '🎯 Play Combo' : '🎯 Play'}
              </button>
            )}
            <button 
              className={`px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all duration-200 ${
                mustPickup 
                  ? 'bg-gradient-to-r from-red-500 to-red-600 text-white' 
                  : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
              }`}
              onClick={onPickup}
              disabled={!canPickup && !mustPickup}
              aria-label={mustPickup ? 'Pick up pile (required)' : 'Pick up pile'}
            >
              {mustPickup ? '⚠️ Must Pick Up' : '📥 Pick Up'}
            </button>
            {canExchangeTrump && (
              <button 
                className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200" 
                onClick={onExchangeTrump}
                aria-label={`Exchange 7 of ${getSuitName(state.trumpSuit)} for trump card`}
              >
                🔄 Exchange 7{trumpIcon}
              </button>
            )}
          </div>
          </div>
        </section>

        {/* Game Log - Bottom of Page */}
        <section className="w-full bg-white/60 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-4">
          <div className="flex flex-col gap-3">
            <div className="text-lg font-bold text-gray-800">📜 Game Log</div>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 h-64 overflow-auto">
              <div className="text-xs space-y-1">
                {state.log.map((line, i) => (
                  <div key={i} className="text-gray-600">{line}</div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {state.winner && (
          <div className="w-full p-6 border-2 border-yellow-400 rounded-2xl bg-gradient-to-r from-yellow-100 to-orange-100 text-center shadow-xl">
            <div className="text-3xl font-bold text-gray-800 mb-2">
              {state.winner === 'human' ? '🎉 Congratulations! You Win! 🎉' : '🤖 Bot Wins! 🤖'}
            </div>
            <div className="text-lg text-gray-600">
              {state.winner === 'human' ? 'Great job! You played an excellent game!' : 'Better luck next time! The bot played well.'}
            </div>
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

