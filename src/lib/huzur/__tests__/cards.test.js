/**
 * Unit tests for core card game logic
 * Run with: npm test (after installing jest)
 */

import {
  createDeck,
  isJoker,
  isTrump,
  compareCards,
  canBeat,
  isCombo,
  canBeatComboByPosition,
  mustFollowSuit,
  canPlayCard,
  SUITS,
  RANKS
} from '../cards';

describe('Card Game Logic Tests', () => {
  
  describe('Deck Creation', () => {
    test('createDeck should create 42 cards (40 regular + 2 jokers)', () => {
      const deck = createDeck();
      expect(deck.length).toBe(42);
    });

    test('deck should contain both jokers', () => {
      const deck = createDeck();
      const jokers = deck.filter(card => isJoker(card));
      expect(jokers.length).toBe(2);
    });

    test('deck should contain all suits and ranks', () => {
      const deck = createDeck();
      const regularCards = deck.filter(card => !isJoker(card));
      expect(regularCards.length).toBe(40);
      
      // Check each suit has 10 cards
      SUITS.forEach(suit => {
        const suitCards = regularCards.filter(card => card.suit === suit);
        expect(suitCards.length).toBe(10);
      });
    });
  });

  describe('Joker Detection', () => {
    test('isJoker should identify black joker', () => {
      expect(isJoker({ rank: 'BJ', suit: null })).toBe(true);
    });

    test('isJoker should identify red joker', () => {
      expect(isJoker({ rank: 'RJ', suit: null })).toBe(true);
    });

    test('isJoker should return false for regular cards', () => {
      expect(isJoker({ rank: '7', suit: 'H' })).toBe(false);
    });
  });

  describe('Trump Detection', () => {
    test('isTrump should identify trump suit cards', () => {
      expect(isTrump({ rank: '7', suit: 'H' }, 'H')).toBe(true);
      expect(isTrump({ rank: 'A', suit: 'H' }, 'H')).toBe(true);
    });

    test('isTrump should return false for non-trump cards', () => {
      expect(isTrump({ rank: '7', suit: 'S' }, 'H')).toBe(false);
    });

    test('isTrump should return true for jokers', () => {
      expect(isTrump({ rank: 'BJ', suit: null }, 'H')).toBe(true);
      expect(isTrump({ rank: 'RJ', suit: null }, 'H')).toBe(true);
    });
  });

  describe('Card Comparison', () => {
    test('Ace should beat 2 in same suit', () => {
      const ace = { rank: 'A', suit: 'H' };
      const two = { rank: '2', suit: 'H' };
      expect(compareCards(ace, two, 'S')).toBe(1);
    });

    test('Trump card should beat non-trump card', () => {
      const trump = { rank: '7', suit: 'H' };
      const nonTrump = { rank: 'A', suit: 'S' };
      expect(canBeat(nonTrump, trump, 'H')).toBe(true);
    });

    test('Joker should beat any card', () => {
      const joker = { rank: 'RJ', suit: null };
      const ace = { rank: 'A', suit: 'H' };
      expect(canBeat(ace, joker, 'H')).toBe(true);
    });

    test('Red Joker should beat Black Joker', () => {
      const redJoker = { rank: 'RJ', suit: null };
      const blackJoker = { rank: 'BJ', suit: null };
      expect(canBeat(blackJoker, redJoker, 'H')).toBe(true);
      expect(canBeat(redJoker, blackJoker, 'H')).toBe(false);
    });
  });

  describe('Combo Detection', () => {
    test('isCombo should identify valid 3-card combo (pair + 1)', () => {
      const combo = [
        { rank: '7', suit: 'H' },
        { rank: '7', suit: 'S' },
        { rank: '8', suit: 'D' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('isCombo should identify valid 5-card combo (2 pairs + 1)', () => {
      const combo = [
        { rank: '7', suit: 'H' },
        { rank: '7', suit: 'S' },
        { rank: '8', suit: 'D' },
        { rank: '8', suit: 'C' },
        { rank: '9', suit: 'H' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('isCombo should accept triplets (3 of same rank)', () => {
      // Three of a kind is now valid
      const triplet = [
        { rank: '7', suit: 'H' },
        { rank: '7', suit: 'S' },
        { rank: '7', suit: 'D' }
      ];
      expect(isCombo(triplet)).toBe(true);
    });

    test('isCombo should reject all different ranks', () => {
      // All different ranks - still invalid
      const invalid = [
        { rank: '7', suit: 'H' },
        { rank: '8', suit: 'S' },
        { rank: '9', suit: 'D' }
      ];
      expect(isCombo(invalid)).toBe(false);
    });

    test('isCombo should reject wrong sized arrays', () => {
      expect(isCombo([{ rank: '7', suit: 'H' }])).toBe(false);
      expect(isCombo([
        { rank: '7', suit: 'H' },
        { rank: '7', suit: 'S' }
      ])).toBe(false);
    });

    test('isCombo should accept 3-card combo with 1 joker as wildcard', () => {
      const combo = [
        { rank: '7', suit: 'H' },
        { rank: 'BJ', suit: null },  // Joker acts as wildcard to pair with 7
        { rank: '8', suit: 'D' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('isCombo should accept 3-card combo with 2 jokers forming pair', () => {
      const combo = [
        { rank: 'BJ', suit: null },  // Jokers form a pair
        { rank: 'RJ', suit: null },
        { rank: '8', suit: 'D' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('isCombo should accept 5-card combo with jokers completing pairs', () => {
      // 1 pair + 1 joker + 2 singles = 2 pairs + 1 single
      const combo = [
        { rank: '7', suit: 'H' },
        { rank: '7', suit: 'S' },
        { rank: 'BJ', suit: null },  // Joker pairs with 8
        { rank: '8', suit: 'D' },
        { rank: '9', suit: 'H' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('isCombo should accept 5-card combo with 2 jokers as one pair', () => {
      // 1 pair + 2 jokers + 1 single = 2 pairs + 1 single
      const combo = [
        { rank: '7', suit: 'H' },
        { rank: '7', suit: 'S' },
        { rank: 'BJ', suit: null },  // Jokers form second pair
        { rank: 'RJ', suit: null },
        { rank: '9', suit: 'H' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('isCombo should reject combo with only jokers and singles', () => {
      // 1 joker + 2 singles = can't form valid combo
      const invalid = [
        { rank: 'BJ', suit: null },
        { rank: '8', suit: 'D' },
        { rank: '9', suit: 'H' }
      ];
      expect(isCombo(invalid)).toBe(false);
    });

    test('isCombo should accept 5-card combo with triplet + pair (3+2)', () => {
      // Triplet + pair is now valid
      const combo = [
        { rank: '7', suit: 'H' },
        { rank: '7', suit: 'S' },
        { rank: '7', suit: 'D' },
        { rank: '8', suit: 'C' },
        { rank: '8', suit: 'H' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('isCombo should accept 5-card combo with quad + single (4+1)', () => {
      // Four of a kind + single is valid
      const combo = [
        { rank: '7', suit: 'H' },
        { rank: '7', suit: 'S' },
        { rank: '7', suit: 'D' },
        { rank: '7', suit: 'C' },
        { rank: '9', suit: 'H' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('isCombo should accept 5-card combo with 2 pairs where single matches a pair rank', () => {
      // 2+2+1 where the 1 matches one of the pairs (3+2 effectively)
      const combo = [
        { rank: '7', suit: 'H' },
        { rank: '7', suit: 'S' },
        { rank: '7', suit: 'D' }, // Third 7
        { rank: '8', suit: 'C' },
        { rank: '8', suit: 'H' }
      ];
      expect(isCombo(combo)).toBe(true);
    });
  });

  describe('Position-Based Combo Beating', () => {
    test('canBeatComboByPosition should compare cards at same positions', () => {
      const lead = [
        { rank: '7', suit: 'H' },
        { rank: '8', suit: 'H' },
        { rank: '9', suit: 'H' }
      ];
      const response = [
        { rank: '10', suit: 'H' },
        { rank: 'J', suit: 'H' },
        { rank: 'Q', suit: 'H' }
      ];
      expect(canBeatComboByPosition(lead, response, 'S')).toBe(true);
    });

    test('canBeatComboByPosition should fail if any position doesnt beat', () => {
      const lead = [
        { rank: '7', suit: 'H' },
        { rank: 'A', suit: 'H' }, // Ace is high
        { rank: '9', suit: 'H' }
      ];
      const response = [
        { rank: '10', suit: 'H' },
        { rank: 'J', suit: 'H' }, // Can't beat Ace
        { rank: 'Q', suit: 'H' }
      ];
      expect(canBeatComboByPosition(lead, response, 'S')).toBe(false);
    });
  });

  describe('Follow Suit Rules', () => {
    test('mustFollowSuit should return true when player has matching suit', () => {
      const leadCard = { rank: '7', suit: 'H' };
      const hand = [
        { rank: '8', suit: 'H' },
        { rank: '9', suit: 'S' }
      ];
      expect(mustFollowSuit(leadCard, hand)).toBe(true);
    });

    test('mustFollowSuit should return false when player has no matching suit', () => {
      const leadCard = { rank: '7', suit: 'H' };
      const hand = [
        { rank: '8', suit: 'S' },
        { rank: '9', suit: 'D' }
      ];
      expect(mustFollowSuit(leadCard, hand)).toBe(false);
    });

    test('mustFollowSuit should ignore jokers in hand', () => {
      const leadCard = { rank: '7', suit: 'H' };
      const hand = [
        { rank: 'BJ', suit: null },
        { rank: '9', suit: 'S' }
      ];
      expect(mustFollowSuit(leadCard, hand)).toBe(false);
    });
  });

  describe('Card Play Validation', () => {
    test('canPlayCard should allow any card when leading', () => {
      const card = { rank: '7', suit: 'H' };
      const hand = [card];
      expect(canPlayCard(null, card, hand, 'S')).toBe(true);
    });

    test('canPlayCard should allow beating card in same suit', () => {
      const leadCard = { rank: '7', suit: 'H' };
      const card = { rank: '8', suit: 'H' };
      const hand = [card];
      expect(canPlayCard(leadCard, card, hand, 'S')).toBe(true);
    });

    test('canPlayCard should reject non-beating card when must follow suit', () => {
      const leadCard = { rank: 'A', suit: 'H' }; // Ace is highest
      const card = { rank: '7', suit: 'H' }; // 7 can't beat Ace
      const hand = [card, { rank: '8', suit: 'S' }];
      expect(canPlayCard(leadCard, card, hand, 'S')).toBe(false);
    });
  });
});

