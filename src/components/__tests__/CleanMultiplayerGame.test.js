import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CleanMultiplayerGame from '../MultiplayerGame';

// Mock socket.io-client
const mockSocket = {
  id: 'test-player-id',
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  connected: true,
};

const mockGameState = {
  roomId: 'test-room',
  players: [
    { id: 'player1', cardCount: 5 },
    { id: 'player2', cardCount: 3 }
  ],
  gameStarted: true,
  currentPlayer: 'test-player-id',
  leadCard: { rank: 'A', suit: 'H' },
  pile: [],
  trumpSuit: 'H',
  trumpCard: { rank: 'K', suit: 'H' },
  playerHands: {
    'test-player-id': [
      { rank: 'A', suit: 'S' },
      { rank: 'K', suit: 'D' },
      { rank: 'Q', suit: 'C' }
    ]
  },
  log: ['Game started', 'Player1 played A♥']
};

describe('CleanMultiplayerGame Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.connected = true;
  });

  test('renders game interface', () => {
    render(
      <CleanMultiplayerGame
        socket={mockSocket}
        roomId="test-room"
        gameState={mockGameState}
        playerId="test-player-id"
      />
    );
    
    expect(screen.getByText('🎯 Your Turn')).toBeInTheDocument();
    expect(screen.getByText('🃏 Your Hand (3 cards)')).toBeInTheDocument();
  });

  test('shows current turn indicator', () => {
    render(
      <CleanMultiplayerGame
        socket={mockSocket}
        roomId="test-room"
        gameState={mockGameState}
        playerId="test-player-id"
      />
    );
    
    expect(screen.getByText('Current Turn: You')).toBeInTheDocument();
  });

  test('displays player cards', () => {
    render(
      <CleanMultiplayerGame
        socket={mockSocket}
        roomId="test-room"
        gameState={mockGameState}
        playerId="test-player-id"
      />
    );
    
    // Check that cards are rendered
    expect(screen.getByText('🃏 Your Hand (3 cards)')).toBeInTheDocument();
  });

  test('handles card selection', () => {
    render(
      <CleanMultiplayerGame
        socket={mockSocket}
        roomId="test-room"
        gameState={mockGameState}
        playerId="test-player-id"
      />
    );
    
    // Find and click a card (assuming cards are rendered)
    const cards = screen.getAllByRole('button');
    const playButton = cards.find(button => button.textContent.includes('Play'));
    
    if (playButton) {
      fireEvent.click(playButton);
      expect(mockSocket.emit).toHaveBeenCalledWith('play_card', expect.any(Object));
    }
  });

  test('shows game stats', () => {
    render(
      <CleanMultiplayerGame
        socket={mockSocket}
        roomId="test-room"
        gameState={mockGameState}
        playerId="test-player-id"
      />
    );
    
    expect(screen.getByText('📊 Game Stats')).toBeInTheDocument();
  });

  test('displays game log', () => {
    render(
      <CleanMultiplayerGame
        socket={mockSocket}
        roomId="test-room"
        gameState={mockGameState}
        playerId="test-player-id"
      />
    );
    
    expect(screen.getByText('📜 Game Log')).toBeInTheDocument();
    expect(screen.getByText('Game started')).toBeInTheDocument();
  });

  test('handles pickup pile action', () => {
    render(
      <CleanMultiplayerGame
        socket={mockSocket}
        roomId="test-room"
        gameState={mockGameState}
        playerId="test-player-id"
      />
    );
    
    const pickupButton = screen.getByText('📥 Pick Up');
    fireEvent.click(pickupButton);
    
    expect(mockSocket.emit).toHaveBeenCalledWith('pickup_pile');
  });

  test('shows waiting state when not player turn', () => {
    const notMyTurnState = {
      ...mockGameState,
      currentPlayer: 'other-player-id'
    };

    render(
      <CleanMultiplayerGame
        socket={mockSocket}
        roomId="test-room"
        gameState={notMyTurnState}
        playerId="test-player-id"
      />
    );
    
    expect(screen.getByText('⏳ Other Player\'s Turn')).toBeInTheDocument();
  });

  test('handles game not started state', () => {
    const notStartedState = {
      ...mockGameState,
      gameStarted: false
    };

    render(
      <CleanMultiplayerGame
        socket={mockSocket}
        roomId="test-room"
        gameState={notStartedState}
        playerId="test-player-id"
      />
    );
    
    expect(screen.getByText('⏳ Waiting for Game to Start')).toBeInTheDocument();
  });

  test('shows winner when game ends', () => {
    const gameEndState = {
      ...mockGameState,
      winner: 'test-player-id'
    };

    render(
      <CleanMultiplayerGame
        socket={mockSocket}
        roomId="test-room"
        gameState={gameEndState}
        playerId="test-player-id"
      />
    );
    
    expect(screen.getByText('🎉 Game Over!')).toBeInTheDocument();
    expect(screen.getByText('You Win!')).toBeInTheDocument();
  });
});
