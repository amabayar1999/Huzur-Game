"use client";

import { useEffect, useMemo, useReducer, useState } from 'react';
import { formatCard, suitToIcon, sortCardsForDisplay, isTrump, canPlayCard, mustFollowSuit, canBeat, isCombo, canPlayCombo } from '../../lib/huzur/cards';
import { gameReducer, initGame } from '../../lib/huzur/gameReducer';

export default function CardGame() {
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
      const t = setTimeout(() => dispatch({ type: 'BOT_ACT' }), 600);
      return () => clearTimeout(t);
    }
  }, [state?.turn]);

  const onPlay = () => {
    if (!state) return;
    
    // Handle combo play (3 or 5 cards)
    if (selectedCombo.length === 3 || selectedCombo.length === 5) {
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

  const onPickup = () => {
    if (!state) return;
    dispatch({ type: 'HUMAN_PICKUP' });
    setSelectedIdx(null);
    setSelectedCombo([]);
  };

  // Handle card selection for combos
  const handleCardClick = (idx) => {
    const card = playerHand[idx];
    
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
    
    if (selectedCombo.length > 0) {
      // If building a combo, add to combo (up to 3 cards)
      if (selectedCombo.length < 3) {
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

  // Check if pickup is allowed
  const canPickup = state && state.leadCard;
  const mustPickup = state && state.leadCard && mustFollowSuit(state.leadCard, state.hands.human) && !state.hands.human.some(card => canBeat(state.leadCard, card, state.trumpSuit));
  
  // Check if current selection is valid
  const isValidPlay = () => {
    if (selectedCombo.length === 3 || selectedCombo.length === 5) {
      // If responding to a combo, any cards are allowed (don't need to be a valid combo)
      if (state.leadCard && isCombo(state.leadCard)) {
        return canPlayCombo(state.leadCard, selectedCombo, state.hands.human, state.trumpSuit);
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

  const onReset = () => {
    dispatch({ type: 'RESET' });
    setSelectedIdx(null);
    setSelectedCombo([]);
  };

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

  return (
    <div className="font-sans min-h-screen p-6 sm:p-10">
      <main className="flex flex-col gap-6 items-center w-full max-w-3xl mx-auto">
        <div className="w-full flex items-center justify-between">
          <h1 className="text-2xl font-bold">Huzur (MVP)</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm">Trump: <span className="text-lg">{trumpIcon}</span></span>
            <button className="px-3 py-1 border rounded" onClick={onReset}>Reset</button>
          </div>
        </div>

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
              Combo selected: {selectedCombo.length}/3 {isCombo(selectedCombo) ? '✓' : '✗'}
            </div>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            {playerHand.map((c, idx) => {
              const isSelected = selectedIdx === idx;
              const isInCombo = selectedCombo.some(card => card === c);
              return (
                <button
                  key={`${c.rank}-${c.suit}-${idx}`}
                  onClick={() => handleCardClick(idx)}
                  className={`px-3 py-2 rounded border ${
                    isSelected ? 'ring-2 ring-blue-500' : 
                    isInCombo ? 'ring-2 ring-green-500 bg-green-50' : ''
                  } ${isTrump(c, state.trumpSuit) ? 'bg-yellow-50' : 'bg-white'}`}
                >
                  {formatCard(c)}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button 
              className="px-4 py-2 border rounded" 
              onClick={onPlay} 
              disabled={!isValidPlay()}
            >
              {selectedCombo.length === 3 ? 'Play Combo' : 'Play'}
            </button>
            <button 
              className={`px-4 py-2 border rounded ${mustPickup ? 'bg-red-100 border-red-300' : ''}`}
              onClick={onPickup}
              disabled={!canPickup && !mustPickup}
            >
              {mustPickup ? 'Must Pick Up' : 'Pick Up'}
            </button>
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


