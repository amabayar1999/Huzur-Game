# Testing Setup Guide

## Quick Start

### 1. Install Jest and Testing Dependencies

```bash
npm install --save-dev jest @types/jest
```

### 2. Create Jest Configuration

Create `jest.config.js` in the project root:

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/lib/huzur/**/*.js',
    '!src/lib/huzur/**/*.test.js',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {},
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
};
```

### 3. Update package.json

Add test scripts to your `package.json`:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build --turbopack",
    "start": "next start",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

### 4. Run Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (auto-rerun on changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Expected Test Output

```
PASS  src/lib/huzur/__tests__/cards.test.js
  Card Game Logic Tests
    Deck Creation
      ✓ createDeck should create 42 cards (40 regular + 2 jokers)
      ✓ deck should contain both jokers
      ✓ deck should contain all suits and ranks
    Joker Detection
      ✓ isJoker should identify black joker
      ✓ isJoker should identify red joker
      ✓ isJoker should return false for regular cards
    Trump Detection
      ✓ isTrump should identify trump suit cards
      ✓ isTrump should return false for non-trump cards
      ✓ isTrump should return true for jokers
    Card Comparison
      ✓ Ace should beat 2 in same suit
      ✓ Trump card should beat non-trump card
      ✓ Joker should beat any card
      ✓ Red Joker should beat Black Joker
    Combo Detection
      ✓ isCombo should identify valid 3-card combo (pair + 1)
      ✓ isCombo should identify valid 5-card combo (2 pairs + 1)
      ✓ isCombo should reject invalid combos
      ✓ isCombo should reject wrong sized arrays
    Position-Based Combo Beating
      ✓ canBeatComboByPosition should compare cards at same positions
      ✓ canBeatComboByPosition should fail if any position doesnt beat
    Follow Suit Rules
      ✓ mustFollowSuit should return true when player has matching suit
      ✓ mustFollowSuit should return false when player has no matching suit
      ✓ mustFollowSuit should ignore jokers in hand
    Card Play Validation
      ✓ canPlayCard should allow any card when leading
      ✓ canPlayCard should allow beating card in same suit
      ✓ canPlayCard should reject non-beating card when must follow suit

Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
```

## Troubleshooting

### Issue: "Cannot use import statement outside a module"

**Solution:** Add to `jest.config.js`:
```javascript
transform: {
  '^.+\\.jsx?$': 'babel-jest',
}
```

Then install babel:
```bash
npm install --save-dev @babel/preset-env babel-jest
```

Create `.babelrc`:
```json
{
  "presets": ["@babel/preset-env"]
}
```

### Issue: Tests pass but coverage is 0%

**Solution:** Make sure Jest is configured to collect coverage from the right files. Check `collectCoverageFrom` in `jest.config.js`.

### Issue: Module not found errors

**Solution:** Check your `moduleNameMapper` in jest.config.js matches your import paths.

## Writing New Tests

### Example Test Structure

```javascript
import { myFunction } from '../myModule';

describe('My Module', () => {
  describe('myFunction', () => {
    test('should do something', () => {
      const result = myFunction(input);
      expect(result).toBe(expectedOutput);
    });

    test('should handle edge case', () => {
      expect(() => myFunction(badInput)).toThrow();
    });
  });
});
```

### Best Practices

1. **Arrange, Act, Assert:** Structure tests clearly
2. **One assertion per test:** Keep tests focused
3. **Descriptive names:** Test names should explain what's being tested
4. **Test edge cases:** Null, undefined, empty arrays, etc.
5. **Use beforeEach/afterEach:** For common setup/teardown

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
```

## Next Steps

1. ✅ Run tests to verify everything works
2. ✅ Add tests to your CI/CD pipeline
3. 📝 Write tests for game reducer
4. 📝 Write tests for bot AI
5. 📝 Aim for 90%+ coverage

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

