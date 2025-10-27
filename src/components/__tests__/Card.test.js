import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Card from '../src/components/Card';

describe('Card Component', () => {
  const mockCard = { rank: 'A', suit: 'H' };
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders card correctly', () => {
    render(<Card card={mockCard} trumpSuit="H" />);
    
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('♥')).toBeInTheDocument();
  });

  test('handles joker cards', () => {
    const jokerCard = { rank: 'BJ', suit: null };
    render(<Card card={jokerCard} trumpSuit="H" />);
    
    expect(screen.getByText('BJ')).toBeInTheDocument();
  });

  test('shows selected state', () => {
    render(<Card card={mockCard} trumpSuit="H" isSelected={true} />);
    
    const cardElement = screen.getByRole('button');
    expect(cardElement).toHaveClass('ring-4', 'ring-blue-400');
  });

  test('shows combo state', () => {
    render(<Card card={mockCard} trumpSuit="H" isInCombo={true} />);
    
    const cardElement = screen.getByRole('button');
    expect(cardElement).toHaveClass('ring-4', 'ring-yellow-400');
  });

  test('handles click events', () => {
    render(<Card card={mockCard} trumpSuit="H" onClick={mockOnClick} />);
    
    const cardElement = screen.getByRole('button');
    fireEvent.click(cardElement);
    
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  test('handles keyboard events', () => {
    render(<Card card={mockCard} trumpSuit="H" onKeyDown={mockOnClick} />);
    
    const cardElement = screen.getByRole('button');
    fireEvent.keyDown(cardElement, { key: 'Enter' });
    
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  test('applies custom className', () => {
    render(<Card card={mockCard} trumpSuit="H" className="custom-class" />);
    
    const cardElement = screen.getByRole('button');
    expect(cardElement).toHaveClass('custom-class');
  });

  test('shows trump suit correctly', () => {
    const trumpCard = { rank: 'K', suit: 'H' };
    render(<Card card={trumpCard} trumpSuit="H" />);
    
    expect(screen.getByText('K')).toBeInTheDocument();
    expect(screen.getByText('♥')).toBeInTheDocument();
  });

  test('handles different card sizes', () => {
    render(<Card card={mockCard} trumpSuit="H" size="large" />);
    
    const cardElement = screen.getByRole('button');
    expect(cardElement).toHaveClass('w-16', 'h-24');
  });
});
