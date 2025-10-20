"use client";

import { isTrump, isJoker } from '../lib/huzur/cards';
import { getCardImagePath, getCardBackImage, shouldUseImages, shouldUseImageForCard, getCardTextRepresentation } from '../lib/huzur/cardImages';

export default function Card({ 
  card, 
  trumpSuit, 
  isSelected = false, 
  isInCombo = false, 
  onClick, 
  onKeyDown,
  className = "",
  size = "normal", // "small", "normal", "large"
  showBack = false, // Show card back instead of face
  hideCenterSuit = false // Hide or minimize center suit symbol
}) {
  if (!card) return null;

  const isTrumpCard = isTrump(card, trumpSuit);
  const isJokerCard = isJoker(card);
  
  // Get image source
  const imageSrc = showBack ? getCardBackImage() : getCardImagePath(card);
  const useImages = shouldUseImageForCard(card);
  const cardText = getCardTextRepresentation(card);
  
  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('Card debug:', { card, imageSrc, showBack, useImages, cardText });
  }
  
  // Size classes - responsive sizing for mobile (increased for better readability)
  const sizeClasses = {
    small: 'w-8 h-12 sm:w-10 sm:h-14',
    normal: 'w-12 h-16 sm:w-16 sm:h-20', 
    large: 'w-16 h-24 sm:w-20 sm:h-28',
    xlarge: 'w-20 h-32 sm:w-24 sm:h-36'
  };

  const cardClasses = `
    card-component
    ${sizeClasses[size]}
    ${className}
    ${isSelected ? 'selected' : ''}
    ${isInCombo ? 'in-combo' : ''}
    ${isTrumpCard ? 'trump' : ''}
    ${isJokerCard ? 'joker' : ''}
  `.trim();

  // Get card description for accessibility
  const getCardDescription = () => {
    if (showBack) return 'Card back';
    if (isJokerCard) {
      return card.rank === 'BJ' ? 'Black Joker' : 'Red Joker';
    }
    const suitNames = { H: 'Hearts', S: 'Spades', D: 'Diamonds', C: 'Clubs' };
    return `${card.rank} of ${suitNames[card.suit]}`;
  };

  return (
    <div
      className={cardClasses}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      aria-label={getCardDescription()}
    >
      {useImages && imageSrc ? (
        <img
          src={imageSrc}
          alt={getCardDescription()}
          className="card-image"
          onError={(e) => {
            console.warn('Failed to load card image:', imageSrc);
            e.target.style.display = 'none';
          }}
        />
      ) : (
        // Enhanced text-based rendering
        <div className="card-inner">
          {showBack ? (
            // Card back design
            <div className="card-back">
              <div className="card-back-pattern">
                <div className="back-symbol">🃏</div>
              </div>
            </div>
          ) : cardText ? (
            <>
              {/* Top-left corner */}
              <div className="card-corner top-left">
                <div className={`card-rank ${cardText.color}`}>
                  {cardText.rank}
                </div>
                <div className={`card-suit ${cardText.color}`}>
                  {cardText.suit}
                </div>
              </div>
              
              {/* Center symbol */}
              {!hideCenterSuit && (
                <div className="card-center">
                  {cardText.isJoker ? (
                    <div className="joker-symbol">
                      <div className={`joker-text ${cardText.color}`}>JOKER</div>
                    </div>
                  ) : (
                    <div className={`center-suit ${cardText.color} ${hideCenterSuit ? 'center-suit-minimal' : ''}`}>
                      {cardText.centerText}
                    </div>
                  )}
                </div>
              )}
              
              {/* Bottom-right corner (rotated) */}
              <div className="card-corner bottom-right">
                <div className={`card-rank ${cardText.color}`}>
                  {cardText.rank}
                </div>
                <div className={`card-suit ${cardText.color}`}>
                  {cardText.suit}
                </div>
              </div>
            </>
          ) : (
            // Ultimate fallback
            <div className="card-fallback">
              <div className="fallback-text">?</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
