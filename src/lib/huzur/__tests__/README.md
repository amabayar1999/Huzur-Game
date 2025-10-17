# Huzur Card Game Tests

## Running Tests

To run the unit tests, you'll need to install Jest:

```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom
```

Then add the test script to `package.json`:

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch"
}
```

Run tests with:

```bash
npm test
```

## Test Coverage

The tests cover:
- **Deck creation** - Verifies deck has correct number of cards
- **Joker detection** - Tests joker identification
- **Trump detection** - Tests trump card identification
- **Card comparison** - Tests card power ordering
- **Combo validation** - Tests valid/invalid combo detection
- **Position-based combo beating** - Tests combo vs combo logic
- **Follow suit rules** - Tests when players must follow suit
- **Card play validation** - Tests legal card plays

## Future Test Additions

Consider adding tests for:
- Game reducer state transitions
- Bot AI decision making
- Trump exchange mechanics
- Win condition detection
- Edge cases with empty hands

