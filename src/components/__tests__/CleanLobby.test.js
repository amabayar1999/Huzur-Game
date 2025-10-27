import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CleanLobby from '../Lobby';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock socket.io-client
const mockSocket = {
  id: 'test-player-id',
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  connected: true,
};

describe('CleanLobby Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.connected = true;
  });

  test('renders lobby interface', () => {
    render(<CleanLobby socket={mockSocket} playerId="test-player-id" />);
    
    expect(screen.getByText('🃏 Huzur Multiplayer')).toBeInTheDocument();
    expect(screen.getByText('Create Room')).toBeInTheDocument();
    expect(screen.getByText('Join Room')).toBeInTheDocument();
  });

  test('shows connection status', () => {
    render(<CleanLobby socket={mockSocket} playerId="test-player-id" />);
    
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  test('handles room creation', async () => {
    render(<CleanLobby socket={mockSocket} playerId="test-player-id" />);
    
    const createButton = screen.getByText('Create Room');
    fireEvent.click(createButton);
    
    expect(mockSocket.emit).toHaveBeenCalledWith('create_room', { roomId: expect.any(String) });
  });

  test('handles room joining', async () => {
    render(<CleanLobby socket={mockSocket} playerId="test-player-id" />);
    
    const joinButton = screen.getByText('Join Room');
    fireEvent.click(joinButton);
    
    expect(mockSocket.emit).toHaveBeenCalledWith('join_room', { roomId: expect.any(String) });
  });

  test('displays available rooms', () => {
    const mockGameState = {
      rooms: [
        { roomId: 'room1', playerCount: 1, gameStarted: false },
        { roomId: 'room2', playerCount: 2, gameStarted: true }
      ]
    };

    render(<CleanLobby socket={mockSocket} playerId="test-player-id" />);
    
    // Simulate receiving room list
    const roomListEvent = mockSocket.on.mock.calls.find(call => call[0] === 'rooms_list');
    if (roomListEvent) {
      roomListEvent[1](mockGameState);
    }
  });

  test('handles socket events', () => {
    render(<CleanLobby socket={mockSocket} playerId="test-player-id" />);
    
    // Check that socket event listeners are set up
    expect(mockSocket.on).toHaveBeenCalledWith('room_created', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('room_joined', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('player_joined', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('game_started', expect.any(Function));
  });

  test('shows error messages', () => {
    render(<CleanLobby socket={mockSocket} playerId="test-player-id" />);
    
    // Simulate error event
    const errorEvent = mockSocket.on.mock.calls.find(call => call[0] === 'error');
    if (errorEvent) {
      errorEvent[1]({ message: 'Test error message' });
    }
  });

  test('handles disconnection', () => {
    mockSocket.connected = false;
    render(<CleanLobby socket={mockSocket} playerId="test-player-id" />);
    
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });
});
