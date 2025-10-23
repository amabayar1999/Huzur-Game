"use client";

import { useEffect, useState } from 'react';
import { formatCard, suitToIcon, sortCardsForDisplay, isTrump, canPlayCard, mustFollowSuit, canBeat, isCombo, canPlayCombo, canBeatComboByPosition } from '../lib/huzur/cards';
import { COMBO_SIZES } from '../lib/huzur/constants';
import Card from './Card';

export default function MultiplayerGame({ 
  socket, 
  roomId, 
  gameState, 
  playerId 
}) {
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [selectedCombo, setSelectedCombo] = useState([]);
  const [error, setError] = useState(null);

  // Get current player's hand
  const playerHand = gameState?.playerHands?.[playerId] || [];
  const sortedHand = sortCardsForDisplay(playerHand, gameState?.trumpSuit);

  // Check if it's current player's turn
  const isMyTurn = gameState?.currentPlayer === playerId;
  const isGameStarted = gameState?.gameStarted;

  // Handle card selection for combos
  const handleCardClick = (idx) => {
    if (!isMyTurn || !isGameStarted) return;

    const card = sortedHand[idx];
    
    // Check if responding to a single card - if so, combos are not allowed
    const isRespondingToSingleCard = gameState?.leadCard && !isCombo(gameState.leadCard);
    
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
      const isRespondingTo5CardCombo = gameState?.leadCard && isCombo(gameState.leadCard) && gameState.leadCard.length === COMBO_SIZES.LARGE;
      const maxSize = isRespondingTo5CardCombo ? COMBO_SIZES.LARGE : 
                      (gameState?.trumpCardDrawn ? COMBO_SIZES.LARGE : COMBO_SIZES.SMALL);
      
      if (selectedCombo.length < maxSize) {
        setSelectedCombo([...selectedCombo, card]);
        setSelectedIdx(null);
      }
    } else if (selectedIdx !== null) {
      // Have a single card selected, start a combo with both cards
      const firstCard = sortedHand[selectedIdx];
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

  // Play selected card/combo
  const handlePlay = () => {
    if (!socket || !isMyTurn) return;
    
    setError(null);
    
    // Handle combo play (3 or 5 cards)
    if (selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) {
      if (!isCombo(selectedCombo)) {
        setError("Invalid combo selection");
        setSelectedCombo([]);
        return;
      }
      
      // Validate combo play
      if (!canPlayCombo(gameState.leadCard, selectedCombo, playerHand, gameState.trumpSuit)) {
        setError("Cannot play this combo");
        setSelectedCombo([]);
        return;
      }
      
      socket.emit('play_card', { card: selectedCombo });
      setSelectedCombo([]);
      return;
    }
    
    // Handle single card play
    if (selectedIdx == null) {
      setError("Please select a card to play");
      return;
    }
    
    const card = sortedHand[selectedIdx];
    
    // Validate single card play
    if (!canPlayCard(gameState.leadCard, card, playerHand, gameState.trumpSuit)) {
      setError("Cannot play this card");
      setSelectedIdx(null);
      return;
    }
    
    socket.emit('play_card', { card });
    setSelectedIdx(null);
  };

  // Pick up pile
  const handlePickup = () => {
    if (!socket || !isMyTurn) return;
    
    setError(null);
    socket.emit('pickup_pile');
    setSelectedIdx(null);
    setSelectedCombo([]);
  };

  // Check if pickup is allowed
  const canPickup = gameState?.leadCard;
  const mustPickup = gameState?.leadCard && mustFollowSuit(gameState.leadCard, playerHand) && 
                     !playerHand.some(card => canBeat(gameState.leadCard, card, gameState.trumpSuit));
  
  // Check if current selection is valid
  const isValidPlay = () => {
    if (selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) {
      // If responding to a combo, check if cards beat it
      if (gameState.leadCard && isCombo(gameState.leadCard)) {
        return canBeatComboByPosition(gameState.leadCard, selectedCombo, gameState.trumpSuit);
      }
      // If leading or responding to single card, must be a valid combo
      if (!isCombo(selectedCombo)) return false;
      return canPlayCombo(gameState.leadCard, selectedCombo, playerHand, gameState.trumpSuit);
    }
    if (selectedIdx != null) {
      return canPlayCard(gameState.leadCard, sortedHand[selectedIdx], playerHand, gameState.trumpSuit);
    }
    return false;
  };

  // Check if "Beat Combo" button should be enabled
  const canBeatComboNow = () => {
    if (!gameState?.leadCard || !isCombo(gameState.leadCard)) return false;
    if (selectedCombo.length !== gameState.leadCard.length) return false;
    return canBeatComboByPosition(gameState.leadCard, selectedCombo, gameState.trumpSuit);
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

  const trumpIcon = suitToIcon(gameState?.trumpSuit);
  const trumpSuitColor = gameState?.trumpSuit === 'H' || gameState?.trumpSuit === 'D' ? 'text-red-600' : 'text-black';
  const isRespondingToCombo = gameState?.leadCard && isCombo(gameState.leadCard);

  if (!isGameStarted) {
    return (
      <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-6 text-center">
        <h2 className="text-xl font-bold text-white mb-4">⏳ Waiting for Game to Start</h2>
        <p className="text-gray-300">The game will begin once all players are ready.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Error Display */}
      {error && (
        <div className="bg-red-500/90 backdrop-blur-sm rounded-xl shadow-lg border border-red-400/30 p-4 text-center">
          <p className="text-white font-medium">{error}</p>
        </div>
      )}

      {/* Game Status */}
      <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">
              {isMyTurn ? '🎯 Your Turn' : '⏳ Other Player\'s Turn'}
            </h2>
            <div className="text-sm text-gray-300">
              Players: {gameState.players?.length || 0}/4
            </div>
          </div>

          {/* Current Turn Indicator */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="text-center">
              <div className="text-lg font-semibold text-white mb-2">
                Current Turn: {gameState.currentPlayer === playerId ? 'You' : 'Another Player'}
              </div>
              {gameState.leadCard && (
                <div className="text-sm text-gray-300">
                  Lead Card: {Array.isArray(gameState.leadCard) ? 
                    `Combo (${gameState.leadCard.length} cards)` : 
                    formatCard(gameState.leadCard)
                  }
                </div>
              )}
            </div>
          </div>

          {/* Players List */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {gameState.players?.map((pid, index) => (
              <div key={pid} className={`rounded-lg p-3 text-center ${
                pid === playerId ? 'bg-blue-500/30 border border-blue-400' : 'bg-gray-600/50'
              }`}>
                <div className="text-sm text-gray-300">Player {index + 1}</div>
                <div className="text-xs text-gray-400 font-mono truncate">
                  {pid === playerId ? 'You' : pid}
                </div>
                <div className="text-xs text-gray-400">
                  {gameState.playerHands?.[pid]?.length || 0} cards
                </div>
                {gameState.currentPlayer === pid && (
                  <div className="text-xs text-yellow-400 mt-1">🎯 Turn</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Play Area - Lead Card */}
      {gameState.leadCard && (
        <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
          <div className="flex flex-col items-center gap-4">
            <h3 className="text-lg font-bold text-white">🎯 Lead Card</h3>
            <div className="flex items-center gap-2 sm:gap-3 justify-center">
              {Array.isArray(gameState.leadCard) ? (
                <div className="flex gap-1 sm:gap-2">
                  {gameState.leadCard.map((card, idx) => (
                    <div key={idx} className="relative">
                      <Card
                        card={card}
                        trumpSuit={gameState.trumpSuit}
                        size="xlarge"
                        className="border-blue-300"
                      />
                      <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                        {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Card
                  card={gameState.leadCard}
                  trumpSuit={gameState.trumpSuit}
                  size="xlarge"
                  className="border-blue-300"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Player Hand */}
      {isMyTurn && (
        <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
          <div className="flex flex-col items-center gap-4">
            <h3 className="text-lg font-bold text-white">🃏 Your Hand ({sortedHand.length} cards)</h3>
            
            {gameState.leadCard && !isCombo(gameState.leadCard) && (
              <div className="text-xs text-orange-600 font-medium">
                ⚠️ Responding to single card - only single cards allowed (no combos)
              </div>
            )}

            <div className="flex flex-wrap gap-1 sm:gap-2 justify-center px-1 sm:px-2">
              {sortedHand.map((card, idx) => {
                const isSelected = selectedIdx === idx;
                const isInCombo = selectedCombo.some(c => c === card);
                const cardDescription = getCardDescription(card);
                const isTrumpCard = isTrump(card, gameState.trumpSuit);
                
                return (
                  <Card
                    key={`${card.rank}-${card.suit}-${idx}`}
                    card={card}
                    trumpSuit={gameState.trumpSuit}
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

            {/* Game Actions */}
            <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 flex-wrap justify-center" role="group" aria-label="Game actions">
              {isRespondingToCombo ? (
                <button 
                  className="px-3 sm:px-4 lg:px-6 py-2 sm:py-2 lg:py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all duration-200 text-xs sm:text-sm lg:text-base" 
                  onClick={handlePlay} 
                  disabled={!canBeatComboNow()}
                  aria-label={`Beat combo with ${selectedCombo.length} cards`}
                >
                  ⚔️ Beat Combo ({selectedCombo.length}/{gameState.leadCard.length})
                </button>
              ) : (
                <button 
                  className="px-3 sm:px-4 lg:px-6 py-2 sm:py-2 lg:py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all duration-200 text-xs sm:text-sm lg:text-base" 
                  onClick={handlePlay} 
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
                onClick={handlePickup}
                disabled={!canPickup}
                aria-label={mustPickup ? 'Pick up pile (required)' : 'Pick up pile'}
              >
                {mustPickup ? '⚠️ Must Pick Up' : '📥 Pick Up'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Stats */}
      <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-3">
          <h3 className="text-lg font-bold text-white">📊 Game Stats</h3>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            {/* Deck */}
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-semibold text-blue-800">🃏 Deck:</div>
              <div className="text-sm text-blue-600">{gameState.deck?.length || 0}</div>
            </div>

            {/* Trump Card */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="text-sm font-semibold text-gray-700">📋 Trump:</div>
              {gameState.trumpCard ? (
                <div className="flex items-center gap-1">
                  <span className="text-sm">{formatCard(gameState.trumpCard)}</span>
                  <span className={trumpSuitColor}>{trumpIcon}</span>
                </div>
              ) : (
                <span className="text-sm text-gray-500">Unknown</span>
              )}
            </div>

            {/* Pile */}
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="text-sm font-semibold text-orange-800">📚 Pile:</div>
              <div className="text-sm text-orange-600">{gameState.pile?.length || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Game Log */}
      {gameState.log && gameState.log.length > 0 && (
        <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
          <h3 className="text-lg font-bold text-white mb-3">📜 Game Log</h3>
          <div className="bg-gray-900/50 rounded-lg p-3 h-32 overflow-auto">
            <div className="text-xs space-y-1">
              {gameState.log.map((line, i) => (
                <div key={i} className="text-gray-300">{line}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Winner Display */}
      {gameState.winner && (
        <div className="w-full bg-green-500/90 backdrop-blur-sm rounded-xl shadow-lg border border-green-400/30 p-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">🎉 Game Over!</h2>
          <p className="text-white text-lg">
            {gameState.winner === playerId ? 'You Win!' : 'Another Player Wins!'}
          </p>
        </div>
      )}
    </div>
  );
}
