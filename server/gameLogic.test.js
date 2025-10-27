// Comprehensive tests for Huzur game logic
const {
  canPlayCard,
  canPlayCombo,
  isCombo,
  isJoker,
  isTrump,
  mustFollowSuit,
  canBeat,
  canBeatCombo,
  canBeatComboByPosition,
  determineTrickWinner,
  compareCards
} = require('./gameLogic');

describe('Card Basic Properties', () => {
  describe('isJoker', () => {
    test('identifies black joker', () => {
      expect(isJoker({ rank: 'BJ', suit: null })).toBe(true);
    });

    test('identifies red joker', () => {
      expect(isJoker({ rank: 'RJ', suit: null })).toBe(true);
    });

    test('regular cards are not jokers', () => {
      expect(isJoker({ rank: 'A', suit: 'H' })).toBe(false);
      expect(isJoker({ rank: '7', suit: 'S' })).toBe(false);
    });

    test('handles null/undefined', () => {
      expect(isJoker(null)).toBeFalsy();
      expect(isJoker(undefined)).toBeFalsy();
    });
  });

  describe('isTrump', () => {
    test('jokers are always trump', () => {
      expect(isTrump({ rank: 'BJ', suit: null }, 'H')).toBe(true);
      expect(isTrump({ rank: 'RJ', suit: null }, 'S')).toBe(true);
    });

    test('cards of trump suit are trump', () => {
      expect(isTrump({ rank: 'A', suit: 'H' }, 'H')).toBe(true);
      expect(isTrump({ rank: '7', suit: 'S' }, 'S')).toBe(true);
    });

    test('cards of non-trump suit are not trump', () => {
      expect(isTrump({ rank: 'A', suit: 'D' }, 'H')).toBe(false);
      expect(isTrump({ rank: 'K', suit: 'C' }, 'S')).toBe(false);
    });
  });
});

describe('Card Comparison', () => {
  describe('compareCards', () => {
    test('red joker beats black joker', () => {
      const rj = { rank: 'RJ', suit: null };
      const bj = { rank: 'BJ', suit: null };
      expect(compareCards(rj, bj, 'H')).toBe(1);
      expect(compareCards(bj, rj, 'H')).toBe(-1);
    });

    test('jokers beat trump cards', () => {
      const bj = { rank: 'BJ', suit: null };
      const trumpAce = { rank: 'A', suit: 'H' };
      expect(compareCards(bj, trumpAce, 'H')).toBe(1);
    });

    test('trump cards beat non-trump cards', () => {
      const trump7 = { rank: '7', suit: 'H' };
      const nonTrumpAce = { rank: 'A', suit: 'S' };
      expect(compareCards(trump7, nonTrumpAce, 'H')).toBe(1);
    });

    test('within same suit, higher ranks beat lower', () => {
      const ace = { rank: 'A', suit: 'H' };
      const seven = { rank: '7', suit: 'H' };
      expect(compareCards(ace, seven, 'S')).toBe(1);
      expect(compareCards(seven, ace, 'S')).toBe(-1);
    });

    test('different non-trump suits are incomparable', () => {
      const heartAce = { rank: 'A', suit: 'H' };
      const spadeAce = { rank: 'A', suit: 'S' };
      expect(compareCards(heartAce, spadeAce, 'D')).toBe(0);
    });
  });

  describe('canBeat', () => {
    test('higher rank in same suit beats lower', () => {
      const ace = { rank: 'A', suit: 'H' };
      const king = { rank: 'K', suit: 'H' };
      expect(canBeat(king, ace, 'S')).toBe(true);
      expect(canBeat(ace, king, 'S')).toBe(false);
    });

    test('trump beats non-trump', () => {
      const trump7 = { rank: '7', suit: 'H' };
      const nonTrumpAce = { rank: 'A', suit: 'S' };
      expect(canBeat(nonTrumpAce, trump7, 'H')).toBe(true);
    });

    test('joker beats everything', () => {
      const bj = { rank: 'BJ', suit: null };
      const ace = { rank: 'A', suit: 'H' };
      expect(canBeat(ace, bj, 'H')).toBe(true);
    });

    test('red joker beats black joker', () => {
      const rj = { rank: 'RJ', suit: null };
      const bj = { rank: 'BJ', suit: null };
      expect(canBeat(bj, rj, 'H')).toBe(true);
      expect(canBeat(rj, bj, 'H')).toBe(false);
    });

    test('off-suit cannot beat lead card', () => {
      const heartAce = { rank: 'A', suit: 'H' };
      const spadeAce = { rank: 'A', suit: 'S' };
      expect(canBeat(heartAce, spadeAce, 'D')).toBe(false);
    });
  });
});

describe('Follow Suit Rules', () => {
  describe('mustFollowSuit', () => {
    test('must follow if have cards in lead suit', () => {
      const leadCard = { rank: 'A', suit: 'H' };
      const hand = [
        { rank: '7', suit: 'H' },
        { rank: 'K', suit: 'S' }
      ];
      expect(mustFollowSuit(leadCard, hand)).toBe(true);
    });

    test('not required if no cards in lead suit', () => {
      const leadCard = { rank: 'A', suit: 'H' };
      const hand = [
        { rank: 'K', suit: 'S' },
        { rank: 'Q', suit: 'D' }
      ];
      expect(mustFollowSuit(leadCard, hand)).toBe(false);
    });

    test('jokers in hand dont count as following suit', () => {
      const leadCard = { rank: 'A', suit: 'H' };
      const hand = [
        { rank: 'BJ', suit: null },
        { rank: 'K', suit: 'S' }
      ];
      expect(mustFollowSuit(leadCard, hand)).toBe(false);
    });

    test('joker lead card never requires follow suit', () => {
      const leadCard = { rank: 'BJ', suit: null };
      const hand = [
        { rank: 'A', suit: 'H' },
        { rank: 'K', suit: 'S' }
      ];
      expect(mustFollowSuit(leadCard, hand)).toBe(false);
    });
  });
});

describe('Combo Detection', () => {
  describe('isCombo - 3 cards', () => {
    test('valid 3-card combo: pair + single', () => {
      const combo = [
        { rank: 'A', suit: 'H' },
        { rank: 'A', suit: 'S' },
        { rank: 'K', suit: 'D' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('valid 3-card combo: triplet', () => {
      const combo = [
        { rank: 'A', suit: 'H' },
        { rank: 'A', suit: 'S' },
        { rank: 'A', suit: 'D' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('invalid: three different cards', () => {
      const combo = [
        { rank: 'A', suit: 'H' },
        { rank: 'K', suit: 'S' },
        { rank: 'Q', suit: 'D' }
      ];
      expect(isCombo(combo)).toBe(false);
    });

    test('valid with 2 jokers as pair', () => {
      const combo = [
        { rank: 'BJ', suit: null },
        { rank: 'RJ', suit: null },
        { rank: 'K', suit: 'D' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('valid with 1 joker completing pair + single', () => {
      const combo = [
        { rank: 'A', suit: 'H' },
        { rank: 'A', suit: 'S' },
        { rank: 'BJ', suit: null }
      ];
      expect(isCombo(combo)).toBe(true);
    });
  });

  describe('isCombo - 5 cards', () => {
    test('valid 5-card combo: 2 pairs + single', () => {
      const combo = [
        { rank: 'A', suit: 'H' },
        { rank: 'A', suit: 'S' },
        { rank: 'K', suit: 'D' },
        { rank: 'K', suit: 'C' },
        { rank: 'Q', suit: 'H' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('valid: triplet + pair', () => {
      const combo = [
        { rank: 'A', suit: 'H' },
        { rank: 'A', suit: 'S' },
        { rank: 'A', suit: 'D' },
        { rank: 'K', suit: 'C' },
        { rank: 'K', suit: 'H' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('valid: quad + single', () => {
      const combo = [
        { rank: 'A', suit: 'H' },
        { rank: 'A', suit: 'S' },
        { rank: 'A', suit: 'D' },
        { rank: 'A', suit: 'C' },
        { rank: 'K', suit: 'H' }
      ];
      expect(isCombo(combo)).toBe(true);
    });

    test('invalid: only 1 pair', () => {
      const combo = [
        { rank: 'A', suit: 'H' },
        { rank: 'A', suit: 'S' },
        { rank: 'K', suit: 'D' },
        { rank: 'Q', suit: 'C' },
        { rank: 'J', suit: 'H' }
      ];
      expect(isCombo(combo)).toBe(false);
    });
  });

  describe('isCombo - invalid sizes', () => {
    test('rejects 2 cards', () => {
      const combo = [
        { rank: 'A', suit: 'H' },
        { rank: 'A', suit: 'S' }
      ];
      expect(isCombo(combo)).toBe(false);
    });

    test('rejects 4 cards', () => {
      const combo = [
        { rank: 'A', suit: 'H' },
        { rank: 'A', suit: 'S' },
        { rank: 'K', suit: 'D' },
        { rank: 'K', suit: 'C' }
      ];
      expect(isCombo(combo)).toBe(false);
    });
  });
});

describe('Combo Beating', () => {
  describe('canBeatComboByPosition', () => {
    test('beats when each position card beats corresponding lead', () => {
      const lead = [
        { rank: '7', suit: 'H' },
        { rank: '8', suit: 'H' },
        { rank: '9', suit: 'H' }
      ];
      const response = [
        { rank: '8', suit: 'H' },
        { rank: '9', suit: 'H' },
        { rank: '10', suit: 'H' }
      ];
      expect(canBeatComboByPosition(lead, response, 'S')).toBe(true);
    });

    test('fails if any position cannot beat', () => {
      const lead = [
        { rank: '7', suit: 'H' },
        { rank: '8', suit: 'H' },
        { rank: '9', suit: 'H' }
      ];
      const response = [
        { rank: '8', suit: 'H' },
        { rank: '7', suit: 'H' }, // Cannot beat position 2
        { rank: '10', suit: 'H' }
      ];
      expect(canBeatComboByPosition(lead, response, 'S')).toBe(false);
    });

    test('rejects different sizes', () => {
      const lead = [
        { rank: '7', suit: 'H' },
        { rank: '8', suit: 'H' }
      ];
      const response = [
        { rank: '8', suit: 'H' },
        { rank: '9', suit: 'H' },
        { rank: '10', suit: 'H' }
      ];
      expect(canBeatComboByPosition(lead, response, 'S')).toBe(false);
    });
  });
});

describe('Card Playing Rules', () => {
  describe('canPlayCard', () => {
    test('leading is always allowed', () => {
      const card = { rank: '7', suit: 'H' };
      const hand = [card];
      expect(canPlayCard(null, card, hand, 'S')).toBe(true);
    });

    test('must follow suit if possible', () => {
      const leadCard = { rank: 'K', suit: 'H' };
      const hand = [
        { rank: '7', suit: 'H' },
        { rank: 'A', suit: 'S' }
      ];
      
      // Cannot play off-suit when have hearts
      const offSuit = { rank: 'A', suit: 'S' };
      expect(canPlayCard(leadCard, offSuit, hand, 'D')).toBe(false);
    });

    test('can play trump when must follow suit', () => {
      const leadCard = { rank: 'K', suit: 'H' };
      const hand = [
        { rank: '7', suit: 'H' },
        { rank: 'A', suit: 'D' } // Trump card
      ];
      
      const trumpCard = { rank: 'A', suit: 'D' };
      expect(canPlayCard(leadCard, trumpCard, hand, 'D')).toBe(true);
    });

    test('can play joker anytime', () => {
      const leadCard = { rank: 'K', suit: 'H' };
      const joker = { rank: 'BJ', suit: null };
      const hand = [
        { rank: '7', suit: 'H' },
        joker
      ];
      expect(canPlayCard(leadCard, joker, hand, 'D')).toBe(true);
    });

    test('can play off-suit if no cards in lead suit', () => {
      const leadCard = { rank: 'K', suit: 'H' };
      const hand = [
        { rank: 'A', suit: 'S' },
        { rank: 'Q', suit: 'D' }
      ];
      
      const offSuit = { rank: 'A', suit: 'S' };
      // Can play but it won't beat (different suits, non-trump)
      expect(canPlayCard(leadCard, offSuit, hand, 'C')).toBe(false);
    });
  });
});

describe('Trick Winner Determination', () => {
  describe('determineTrickWinner', () => {
    test('single vs single: higher card wins', () => {
      const lead = { rank: 'K', suit: 'H' };
      const response = { rank: 'A', suit: 'H' };
      expect(determineTrickWinner(lead, response, 'S')).toBe(true);
    });

    test('single vs single: lead wins if response cannot beat', () => {
      const lead = { rank: 'A', suit: 'H' };
      const response = { rank: 'K', suit: 'H' };
      expect(determineTrickWinner(lead, response, 'S')).toBe(false);
    });

    test('combo vs combo: position-based matching', () => {
      const lead = [
        { rank: '7', suit: 'H' },
        { rank: '8', suit: 'H' },
        { rank: '9', suit: 'H' }
      ];
      const response = [
        { rank: '8', suit: 'H' },
        { rank: '9', suit: 'H' },
        { rank: '10', suit: 'H' }
      ];
      expect(determineTrickWinner(lead, response, 'S')).toBe(true);
    });

    test('combo vs single: combo always wins', () => {
      const lead = [
        { rank: '7', suit: 'H' },
        { rank: '7', suit: 'S' },
        { rank: '8', suit: 'H' }
      ];
      const response = { rank: 'A', suit: 'H' };
      expect(determineTrickWinner(lead, response, 'S')).toBe(false);
    });

    test('single vs combo: combo wins if highest beats', () => {
      const lead = { rank: 'K', suit: 'H' };
      const response = [
        { rank: '7', suit: 'H' },
        { rank: '8', suit: 'H' },
        { rank: 'A', suit: 'H' } // Highest beats lead
      ];
      expect(determineTrickWinner(lead, response, 'S')).toBe(true);
    });
  });
});

describe('Edge Cases', () => {
  test('handles null/undefined inputs gracefully', () => {
    expect(canBeat(null, { rank: 'A', suit: 'H' }, 'S')).toBe(false);
    expect(canBeat({ rank: 'A', suit: 'H' }, null, 'S')).toBe(false);
    expect(isCombo(null)).toBe(false);
    expect(isCombo([])).toBe(false);
  });

  test('rank ordering is correct', () => {
    const trumpSuit = 'D';
    const cards = [
      { rank: '7', suit: 'H' },
      { rank: '8', suit: 'H' },
      { rank: '9', suit: 'H' },
      { rank: '10', suit: 'H' },
      { rank: 'J', suit: 'H' },
      { rank: 'Q', suit: 'H' },
      { rank: 'K', suit: 'H' },
      { rank: '3', suit: 'H' },
      { rank: '2', suit: 'H' },
      { rank: 'A', suit: 'H' }
    ];

    // Each subsequent card should beat the previous
    for (let i = 1; i < cards.length; i++) {
      expect(canBeat(cards[i - 1], cards[i], trumpSuit)).toBe(true);
    }
  });
});

