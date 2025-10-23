"use client";

import { useEffect, useMemo, useReducer, useState } from 'react';
import { formatCard, suitToIcon, sortCardsForDisplay, isTrump, canPlayCard, mustFollowSuit, canBeat, isCombo, canPlayCombo, canBeatComboByPosition } from '../../lib/huzur/cards';
import { gameReducer, initGame } from '../../lib/huzur/gameReducer';
import { COMBO_SIZES, DELAYS } from '../../lib/huzur/constants';
import ErrorBoundary from '../../components/ErrorBoundary';
import Popup from '../../components/Popup';
import Card from '../../components/Card';

function CardGameInner() {
  const [state, dispatch] = useReducer(gameReducer, null, initGame);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [selectedCombo, setSelectedCombo] = useState([]);
  const [isClient, setIsClient] = useState(false);
  const [showWinPopup, setShowWinPopup] = useState(false);

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

  // Show win popup when there's a winner
  useEffect(() => {
    if (state?.winner) {
      setShowWinPopup(true);
    }
  }, [state?.winner]);

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
    setShowWinPopup(false);
    // Then reset the game state
    dispatch({ type: 'RESET' });
  };

  const onCloseWinPopup = () => {
    setShowWinPopup(false);
  };

  const onExchangeTrump = () => {
    if (!state) return;
    dispatch({ type: 'HUMAN_EXCHANGE_TRUMP' });
  };

  // Check if player can exchange trump
  const canExchangeTrump = state && state.trumpCard && state.deck.length > 0 && state.hands.human.some(card => 
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
  const trumpSuitColor = state.trumpSuit === 'H' || state.trumpSuit === 'D' ? 'text-red-600' : 'text-black';
  const isRespondingToCombo = state.leadCard && isCombo(state.leadCard);

  return (
    <div className="font-sans min-h-screen p-3 sm:p-6 lg:p-10" style={{backgroundColor: '#36454f'}}>
      <main className="flex flex-col gap-3 sm:gap-6 items-center w-full max-w-4xl mx-auto">
        <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🃏 Huzur
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                className="px-3 py-2 sm:px-4 sm:py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base" 
                onClick={onReset}
                disabled={!isClient}
              >
                🔄 Reset
              </button>
            </div>
          </div>
        </div>


        <section className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-3 sm:p-4">
          <div className="flex flex-col items-center gap-2 sm:gap-3">
            <div className="text-base sm:text-lg font-bold text-gray-100">🤖 Bot Hand: {state.hands.bot.length} cards</div>
            <div className="flex gap-1 sm:gap-2 justify-center flex-wrap px-1 sm:px-2">
              {Array.from({ length: state.hands.bot.length }).map((_, i) => (
                <Card
                  key={i}
                  card={{ rank: 'A', suit: 'S' }} // Dummy card for back display
                  trumpSuit={state.trumpSuit}
                  size="small"
                  showBack={true}
                  className="border-gray-500"
                />
              ))}
            </div>
          </div>
        </section>


        {/* Enhanced Play Area - Lead vs Response Cards */}
        <section className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
          <div className="flex flex-col items-center gap-4 sm:gap-6">
            <div className="w-full flex items-center justify-center bg-gradient-to-r from-gray-700/50 to-gray-600/50 rounded-xl border-2 border-dashed border-gray-500/50 p-6 sm:p-8 lg:p-12 min-h-64 sm:min-h-80">
              
              {state.leadCard ? (
                <div className="flex flex-col items-center gap-4 sm:gap-6 w-full">
                  {/* Lead Card Section */}
                  <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 lg:py-6 bg-gray-800/80 rounded-xl shadow-xl border-2 border-blue-400">
                    <div className="text-sm sm:text-base lg:text-lg font-bold text-gray-200 mb-2 sm:mb-4 text-center">
                      🎯 Lead Card {state.turn === 'bot' ? '(Bot)' : '(You)'}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 justify-center">
                      {Array.isArray(state.leadCard) ? (
                        <div className="flex gap-1 sm:gap-2">
                          {state.leadCard.map((card, idx) => (
                            <div key={idx} className="relative">
                              <Card
                                card={card}
                                trumpSuit={state.trumpSuit}
                                size="xlarge"
                                className="border-blue-300 play-area"
                              />
                              {/* Position indicator for combo cards */}
                              <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                                {idx + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Card
                          card={state.leadCard}
                          trumpSuit={state.trumpSuit}
                          size="xlarge"
                          className="border-blue-300 play-area"
                        />
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                // No lead card - show turn indicator
                <div className={`px-3 sm:px-4 lg:px-8 py-2 sm:py-3 lg:py-4 rounded-2xl border-2 font-bold text-sm sm:text-lg lg:text-2xl transition-all duration-500 transform hover:scale-105 ${
                  state.turn === 'human' 
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 border-green-300 text-white shadow-2xl shadow-green-500/50 animate-pulse' 
                    : 'bg-gradient-to-r from-blue-500 to-cyan-500 border-blue-300 text-white shadow-2xl shadow-blue-500/50 animate-pulse'
                }`}>
                  {state.turn === 'human' ? '🎯 Your Turn' : '🤖 Bot\'s Turn'}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-3 sm:p-4">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <div className="text-base sm:text-lg font-bold text-gray-100">🃏 Your Hand ({playerHand.length} cards)</div>
          {state.leadCard && !isCombo(state.leadCard) && (
            <div className="text-xs text-orange-600 font-medium">
              ⚠️ Responding to single card - only single cards allowed (no combos)
            </div>
          )}
          <div className="flex flex-wrap gap-1 sm:gap-2 justify-center px-1 sm:px-2">
            {playerHand.map((c, idx) => {
              const isSelected = selectedIdx === idx;
              const isInCombo = selectedCombo.some(card => card === c);
              const cardDescription = getCardDescription(c);
              const isTrumpCard = isTrump(c, state.trumpSuit);
              
              return (
                <Card
                  key={`${c.rank}-${c.suit}-${idx}`}
                  card={c}
                  trumpSuit={state.trumpSuit}
                  isSelected={isSelected}
                  isInCombo={isInCombo}
                  onClick={() => handleCardClick(idx)}
                  onKeyDown={(e) => handleCardKeyDown(e, idx)}
                  size="large"
                  className={`focus:outline-none focus:ring-4 focus:ring-blue-400 touch-manipulation transition-all duration-200 ${
                    isInCombo 
                      ? 'ring-4 ring-yellow-400 shadow-yellow-500/50 transform scale-105 opacity-75' 
                      : isSelected 
                        ? 'ring-4 ring-blue-400 shadow-blue-500/50 transform scale-105'
                        : 'hover:scale-105 hover:shadow-lg'
                  }`}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 flex-wrap justify-center" role="group" aria-label="Game actions">
            {isRespondingToCombo ? (
              // Special button for beating combos
              <button 
                className="px-3 sm:px-4 lg:px-6 py-2 sm:py-2 lg:py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all duration-200 text-xs sm:text-sm lg:text-base" 
                onClick={onBeatCombo} 
                disabled={!canBeatComboNow()}
                aria-label={`Beat combo with ${selectedCombo.length} cards`}
              >
                ⚔️ Beat Combo ({selectedCombo.length}/{state.leadCard.length})
              </button>
            ) : (
              // Regular play button
              <button 
                className="px-3 sm:px-4 lg:px-6 py-2 sm:py-2 lg:py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all duration-200 text-xs sm:text-sm lg:text-base" 
                onClick={onPlay} 
                disabled={!isValidPlay()}
                aria-label={(selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) ? 'Play selected combo' : 'Play selected card'}
              >
                {(selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) ? '🎯 Play Combo' : '🎯 Play'}
              </button>
            )}
            <button 
              className={`px-3 sm:px-4 lg:px-6 py-2 sm:py-2 lg:py-3 rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all duration-200 text-xs sm:text-sm lg:text-base ${
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
                className="px-3 sm:px-4 lg:px-6 py-2 sm:py-2 lg:py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-xs sm:text-sm lg:text-base" 
                onClick={onExchangeTrump}
                aria-label={`Exchange 7 of ${getSuitName(state.trumpSuit)} for trump card`}
              >
                🔄 Exchange 7<span className={trumpSuitColor}>{trumpIcon}</span>
              </button>
            )}
          </div>
          </div>
        </section>

        {/* Game Stats - Below Player Hand */}
        <section className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-3 sm:p-4">
          <div className="flex flex-col items-center gap-2 sm:gap-3">
            {/* Essential Info - Horizontal Layout */}
            <div className="flex items-center gap-1 sm:gap-2 lg:gap-4 flex-wrap justify-center">
              {/* Deck */}
              <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-xs sm:text-sm font-semibold text-blue-800">🃏 Deck:</div>
                <div className="relative">
                        <Card
                          card={{ rank: 'A', suit: 'S' }}
                          trumpSuit={state.trumpSuit}
                    size="small"
                          showBack={true}
                    className="border-blue-900"
                          hideCenterSuit={true}
                        />
                  <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-3 h-3 sm:w-4 sm:h-4 flex items-center justify-center font-bold">
                      {state.deck.length}
                  </div>
                </div>
                <div className="text-xs text-blue-600">
                  {state.deck.length}
                </div>
                {state.deck.length === 0 && (
                  <div className="text-xs text-red-600 font-bold bg-red-50 px-1 py-0.5 rounded border border-red-200">
                    Empty!
                  </div>
                )}
                {state.deck.length === 1 && !state.trumpCardDrawn && (
                  <div className="text-xs text-yellow-600 font-bold bg-yellow-50 px-1 py-0.5 rounded border border-yellow-200">
                    Trump next!
                  </div>
                )}
              </div>

              {/* Under Deck Card - Enhanced */}
              <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-xs sm:text-sm font-semibold text-gray-700">📋 Under:</div>
                {state.trumpCard ? (
                  <div className="relative">
                    <Card
                      card={state.trumpCard}
                      trumpSuit={state.trumpSuit}
                      size="small"
                      className="border-gray-400"
                      hideCenterSuit={true}
                    />
                    {state.trumpCardDrawn && (
                      <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-3 h-3 sm:w-4 sm:h-4 flex items-center justify-center font-bold">
                        ✓
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-5 h-6 sm:w-6 sm:h-8 bg-gray-200 rounded border border-dashed border-gray-400 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">?</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        </section>

        {/* Game Log - Bottom of Page */}
        <section className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:gap-3">
            <div className="text-base sm:text-lg font-bold text-gray-100">📜 Game Log</div>
            <div className="bg-gray-900/50 rounded-xl border border-gray-600/30 p-2 sm:p-3 h-32 sm:h-48 lg:h-64 overflow-auto">
              <div className="text-xs space-y-1">
                {state.log.map((line, i) => (
                  <div key={i} className="text-gray-300">{line}</div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Win Popup */}
        <Popup
          isOpen={showWinPopup}
          onClose={onCloseWinPopup}
          title={state?.winner === 'human' ? '🎉 Congratulations! You Win! 🎉' : '🤖 Bot Wins! 🤖'}
          message={state?.winner === 'human' ? 'Great job! You played an excellent game!' : 'Better luck next time! The bot played well.'}
          variant={state?.winner === 'human' ? 'win' : 'lose'}
        >
          <div className="flex gap-4 justify-center">
            <button
              onClick={onCloseWinPopup}
              className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
            >
              Close
            </button>
            <button
              onClick={onReset}
              className={`px-6 py-3 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 ${
                state?.winner === 'human' 
                  ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' 
                  : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
              }`}
            >
              Play Again
            </button>
          </div>
        </Popup>
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

