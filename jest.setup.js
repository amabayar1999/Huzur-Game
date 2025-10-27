import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  useParams: () => ({
    roomId: 'test-room',
  }),
}));

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    id: 'test-socket-id',
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    connected: true,
    disconnect: jest.fn(),
  })),
}));

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    reload: jest.fn(),
  },
  writable: true,
});
