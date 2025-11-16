"use client";

import { useEffect, useState, useMemo } from 'react';
import { formatCard, suitToIcon, sortCardsForDisplay, isTrump, isCombo } from '../lib/huzur/cards';
import { COMBO_SIZES } from '../lib/huzur/constants';
import Card from './Card';
import Popup from './Popup';

export default function CleanMultiplayerGame({ 
  socket, 
  roomId, 
  gameState, 
  playerId 
}) {
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [selectedCombo, setSelectedCombo] = useState([]);
  const [error, setError] = useState(null);
  const [showWinPopup, setShowWinPopup] = useState(false);
  // ✅ FIX: Removed starting state - game should only be started from Lobby

  // ✅ Fix: Use both playerHands[playerId] and hand property, with better null checking
  const playerHand = useMemo(() => {
    if (!gameState || !playerId) {
      console.warn('⚠️ No gameState or playerId:', { gameState: !!gameState, playerId });
      return [];
    }
    
    // Try playerHands first (scoped by playerId)
    if (gameState.playerHands && gameState.playerHands[playerId] !== undefined) {
      const hand = gameState.playerHands[playerId];
      console.log('✅ Found hand in playerHands:', { playerId, handLength: hand?.length });
      return Array.isArray(hand) ? hand : [];
    }
    
    // Fallback to hand property (direct from server)
    if (gameState.hand !== undefined) {
      const hand = gameState.hand;
      console.log('✅ Found hand in hand property:', { handLength: hand?.length });
      return Array.isArray(hand) ? hand : [];
    }
    
    console.warn('⚠️ No hand found:', { 
      playerId, 
      playerHandsKeys: gameState.playerHands ? Object.keys(gameState.playerHands) : 'none',
      hasHandProperty: 'hand' in gameState
    });
    
    return [];
  }, [gameState, playerId]);
  
  const sortedHand = sortCardsForDisplay(playerHand, gameState?.trumpSuit);

  // Debug logging
  useEffect(() => {
    console.log('CleanMultiplayerGame - gameState:', gameState);
    console.log('CleanMultiplayerGame - playerId:', playerId);
    console.log('CleanMultiplayerGame - playerHand:', playerHand);
    console.log('CleanMultiplayerGame - isMyTurn:', gameState?.currentPlayer === playerId);
  }, [gameState, playerId, playerHand]);

  // Handle server errors
  useEffect(() => {
    if (socket) {
      const handleServerError = (error) => {
        setError(error.message);
        setTimeout(() => setError(null), 5000);
      };

      socket.on('server_error', handleServerError);
      
      return () => {
        socket.off('server_error', handleServerError);
      };
    }
  }, [socket]);

  // Show win popup when there's a winner
  useEffect(() => {
    if (gameState?.winner) {
      setShowWinPopup(true);
    } else {
      setShowWinPopup(false);
    }
  }, [gameState?.winner]);

  // Check if it's current player's turn
  const isMyTurn = gameState?.currentPlayer === playerId;
  const isGameStarted = gameState?.started || gameState?.gameStarted; // Use standardized property with fallback
  const isRoomOwner = gameState?.roomOwner === playerId;
  // ✅ FIX: Removed canStartGame - game should only be started from Lobby
  // const canStartGame = gameState?.canStart && isRoomOwner && !isGameStarted;
  
  // Debug logging for game state
  console.log('🎮 MultiplayerGame Debug:', {
    gameState: gameState,
    started: gameState?.started,
    gameStarted: gameState?.gameStarted,
    isGameStarted,
    playerCount: gameState?.playerCount,
    players: gameState?.players
  });

  // Handle card selection for combos
  const handleCardClick = (idx) => {
    if (!isMyTurn || !isGameStarted) return;

    const card = sortedHand[idx];
    
    // Check if responding to a single card - if so, combos are not allowed
    const isRespondingToSingleCard = gameState?.leadCard && !Array.isArray(gameState.leadCard);
    
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
      const isRespondingTo5CardCombo = gameState?.leadCard && Array.isArray(gameState.leadCard) && gameState.leadCard.length === COMBO_SIZES.LARGE;
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

  // Play selected card/combo - CLIENT ONLY SENDS INTENT
  const handlePlay = () => {
    if (!socket || !isMyTurn) return;
    
    setError(null);
    
    // Handle combo play (3 or 5 cards)
    if (selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) {
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
    socket.emit('play_card', { card });
    setSelectedIdx(null);
  };

  // Pick up pile - CLIENT ONLY SENDS INTENT
  const handlePickup = () => {
    if (!socket || !isMyTurn) return;
    
    setError(null);
    socket.emit('pickup_pile');
    setSelectedIdx(null);
    setSelectedCombo([]);
  };

  // Exchange trump - CLIENT ONLY SENDS INTENT
  const handleExchangeTrump = () => {
    if (!socket) return;
    
    setError(null);
    socket.emit('exchange_trump');
    setSelectedIdx(null);
    setSelectedCombo([]);
  };

  // Handle closing win popup
  const handleCloseWinPopup = () => {
    setShowWinPopup(false);
  };

  // Handle restarting the game
  const handleRestartGame = () => {
    // Redirect back to lobby to start a new game
    window.location.href = '/multiplayer';
  };

  // Check if pickup is allowed (server will validate)
  const canPickup = gameState?.leadCard;
  
  // Check if player can exchange trump
  const canExchangeTrump = gameState && gameState.trumpCard && (gameState.deckCount || gameState.deck?.length || 0) > 0 && playerHand.some(card => 
    card.rank === '7' && card.suit === gameState.trumpSuit
  );
  
  // Check if current selection is valid
  const isValidPlay = () => {
    // For combos, validate structure
    if (selectedCombo.length === COMBO_SIZES.SMALL || selectedCombo.length === COMBO_SIZES.LARGE) {
      return isCombo(selectedCombo); // ✅ Validates combo structure (pair+1 for 3-card, 2 pairs for 5-card)
    }
    // For single cards, just check if one is selected
    return selectedIdx != null;
  };

  // Check if "Beat Combo" button should be enabled
  const canBeatComboNow = () => {
    if (!gameState?.leadCard || !Array.isArray(gameState.leadCard)) return false;
    
    // Must match size
    if (selectedCombo.length !== gameState.leadCard.length) return false;
    
    // When beating a combo, just needs to match size (server validates beating logic)
    return true;
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
  const isRespondingToCombo = gameState?.leadCard && Array.isArray(gameState.leadCard);

  if (!isGameStarted) {
    const isRoomOwner = gameState?.roomOwner === playerId;
    const canStartGame = gameState?.canStart && isRoomOwner;
    const playerCount = gameState?.playerCount || gameState?.players?.length || 0;
    
    return (
      <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-6 text-center">
        <h2 className="text-xl font-bold text-white mb-4">⏳ Waiting for Game to Start</h2>
        
        {/* Room Status Display */}
        <div className="mb-6 p-4 bg-gray-700/50 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Room Status</h3>
            <button 
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm"
              onClick={() => {
                if (socket) {
                  socket.emit('get_room_state');
                }
              }}
              title="Refresh room status"
            >
              🔄 Refresh
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-center">
              <div className="text-gray-400">Players</div>
              <div className="text-white font-semibold">{playerCount}/2</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Room Owner</div>
              <div className={`font-semibold ${isRoomOwner ? 'text-blue-400' : 'text-gray-400'}`}>
                {isRoomOwner ? 'You' : 'Another Player'}
              </div>
            </div>
          </div>
        </div>
        
        {/* ✅ FIX: Removed start game button - game should only be started from Lobby */}
        {/* Waiting States - Game page only shows waiting, never starts the game */}
        <div className="p-4 rounded-lg">
          {isRoomOwner ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="text-yellow-400 font-semibold mb-2">⏳ Waiting for Players</div>
              <div className="text-sm text-gray-300 mb-3">
                You need 1 more player to start the game. Please go back to the lobby to start the game once both players are ready.
              </div>
              <div className="text-xs text-gray-400 mb-2">
                Room ID: <span className="font-mono bg-gray-700 px-2 py-1 rounded">{roomId}</span>
              </div>
              <div className="text-xs text-gray-400">
                Note: Games can only be started from the lobby page.
              </div>
            </div>
          ) : (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="text-blue-400 font-semibold mb-2">⏳ Waiting for Room Owner</div>
              <div className="text-sm text-gray-300">
                The room owner will start the game once ready. You'll be notified when it begins.
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Note: Games can only be started from the lobby page.
              </div>
            </div>
          )}
        </div>
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
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-300">
                Players: {gameState.playerCount || gameState.players?.length || 0}/2
              </div>
              <button 
                className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-xs"
                onClick={() => {
                  if (socket) {
                    socket.emit('get_room_state');
                  }
                }}
                title="Refresh game status"
              >
                🔄
              </button>
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
            {(gameState.players || []).map((player, index) => (
              <div key={player.id} className={`rounded-lg p-3 text-center ${
                player.id === playerId ? 'bg-blue-500/30 border border-blue-400' : 'bg-gray-600/50'
              }`}>
                <div className="text-sm text-gray-300">Player {index + 1}</div>
                <div className="text-xs text-gray-400 font-mono truncate">
                  {player.id === playerId ? 'You' : player.id}
                </div>
                <div className="text-xs text-gray-400">
                  {player.cardCount} cards
                </div>
                {gameState.currentPlayer === player.id && (
                  <div className="text-xs text-yellow-400 mt-1">🎯 Turn</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Play Area */}
      <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-4">
          <h3 className="text-lg font-bold text-white">🎯 Play Area</h3>
          {gameState.leadCard ? (
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
          ) : (
            <div className={`px-3 sm:px-4 lg:px-8 py-2 sm:py-3 lg:py-4 rounded-2xl border-2 font-bold text-sm sm:text-lg lg:text-2xl transition-all duration-500 transform hover:scale-105 ${
              isMyTurn 
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 border-green-300 text-white shadow-2xl shadow-green-500/50 animate-pulse' 
                : 'bg-gradient-to-r from-blue-500 to-cyan-500 border-blue-300 text-white shadow-2xl shadow-blue-500/50 animate-pulse'
            }`}>
              {isMyTurn ? '🎯 Your Turn' : '⏳ Another Player\'s Turn'}
            </div>
          )}
        </div>
      </div>

      {/* Player Hand */}
      <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-4">
          <h3 className="text-lg font-bold text-white">🃏 Your Hand ({sortedHand.length} cards)</h3>
          
          {/* Show turn indicator */}
          {!isMyTurn && (
            <div className="text-sm text-yellow-400 font-medium">
              ⏳ Waiting for your turn
            </div>
          )}
          
          {gameState.leadCard && !Array.isArray(gameState.leadCard) && (
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
                  onClick={() => isMyTurn ? handleCardClick(idx) : null}
                  onKeyDown={(e) => isMyTurn ? handleCardKeyDown(e, idx) : null}
                  size="large"
                  className={`focus:outline-none focus:ring-4 focus:ring-blue-400 touch-manipulation transition-all duration-200 ${
                    !isMyTurn 
                      ? 'opacity-75 cursor-not-allowed' 
                      : isInCombo 
                        ? 'ring-4 ring-yellow-400 shadow-yellow-500/50 transform scale-105 opacity-75' 
                        : isSelected 
                          ? 'ring-4 ring-blue-400 shadow-blue-500/50 transform scale-105'
                          : 'hover:scale-105 hover:shadow-lg'
                  }`}
                />
              );
            })}
          </div>

          {/* Game Actions - Only show when it's player's turn */}
          {isMyTurn && (
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
                className="px-3 sm:px-4 lg:px-6 py-2 sm:py-2 lg:py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all duration-200 text-xs sm:text-sm lg:text-base"
                onClick={handlePickup}
                disabled={!canPickup}
                aria-label="Pick up pile"
              >
                📥 Pick Up
              </button>
              {canExchangeTrump && (
                <button 
                  className="px-3 sm:px-4 lg:px-6 py-2 sm:py-2 lg:py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-xs sm:text-sm lg:text-base" 
                  onClick={handleExchangeTrump}
                  aria-label={`Exchange 7 of ${getSuitName(gameState.trumpSuit)} for trump card`}
                >
                  🔄 Exchange 7<span className={trumpSuitColor}>{trumpIcon}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Game Stats */}
      <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-3">
          <h3 className="text-lg font-bold text-white">📊 Game Stats</h3>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            {/* Deck */}
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-semibold text-blue-800">🃏 Deck:</div>
              <div className="text-sm text-blue-600">{gameState.deckCount || 0}</div>
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

            {/* Game Statistics */}
            {gameState.gameStats && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="text-sm font-semibold text-purple-800">🃏 Played:</div>
                  <div className="text-sm text-purple-600">{gameState.gameStats.cardsPlayed?.[playerId] || 0}</div>
                </div>
              </>
            )}
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

      {/* Win/Lose Popup */}
      <Popup
        isOpen={showWinPopup}
        onClose={handleCloseWinPopup}
        title={gameState?.winner === playerId ? '🎉 Congratulations! You Win! 🎉' : '😔 You Lose'}
        message={gameState?.winner === playerId ? 'Great job! You played an excellent game!' : 'Better luck next time!'}
        variant={gameState?.winner === playerId ? 'win' : 'lose'}
      >
        <div className="flex gap-4 justify-center">
          <button
            onClick={handleCloseWinPopup}
            className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
          >
            Close
          </button>
          <button
            onClick={handleRestartGame}
            className={`px-6 py-3 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 ${
              gameState?.winner === playerId 
                ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700' 
                : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
            }`}
          >
            New Game
          </button>
        </div>
      </Popup>
    </div>
  );
}
