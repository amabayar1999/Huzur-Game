"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { io } from 'socket.io-client';
import ErrorBoundary from '../../../../components/ErrorBoundary';
import MultiplayerGame from '../../../../components/MultiplayerGame';

function MultiplayerGamePage() {
  const params = useParams();
  const roomId = params.roomId;
  
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!roomId) return;

    // Initialize socket connection
    const newSocket = io('http://localhost:4000', {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log('🔌 Connected to server:', newSocket.id);
      setConnected(true);
      setError(null);
      
      // Join the room
      newSocket.emit('join_room', { roomId });
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
      setConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ Connection error:', err);
      setError('Failed to connect to server. Make sure the server is running on port 4000.');
    });

    // Game events
    newSocket.on('room_joined', (data) => {
      console.log('👤 Joined room:', data);
      setGameState(data.gameState);
    });

    newSocket.on('player_joined', (data) => {
      console.log('👤 Player joined:', data);
      setGameState(data.gameState);
    });

    newSocket.on('player_left', (data) => {
      console.log('👋 Player left:', data);
      setGameState(data.gameState);
    });

    newSocket.on('game_started', (data) => {
      console.log('🎮 Game started:', data);
      setGameState(data);
    });

    newSocket.on('card_played', (data) => {
      console.log('🃏 Card played:', data);
      setGameState(data.gameState);
    });

    newSocket.on('pile_picked_up', (data) => {
      console.log('📥 Pile picked up:', data);
      setGameState(data.gameState);
    });

    newSocket.on('error', (data) => {
      console.error('❌ Server error:', data);
      setError(data.message);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, [roomId]);

  // Remove the old handlePlayCard function since it's now handled in MultiplayerGame component

  if (!connected && !error) {
    return (
      <div className="font-sans min-h-screen p-6 sm:p-10" style={{backgroundColor: '#36454f'}}>
        <main className="flex flex-col gap-6 items-center w-full max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-white">🃏 Huzur Multiplayer</h1>
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            Connecting to game room...
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="font-sans min-h-screen p-6 sm:p-10" style={{backgroundColor: '#36454f'}}>
        <main className="flex flex-col gap-6 items-center w-full max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-white">🃏 Huzur Multiplayer</h1>
          <div className="bg-red-500/90 backdrop-blur-sm rounded-xl shadow-lg border border-red-400/30 p-6 text-center">
            <div className="text-white">
              <h2 className="text-xl font-bold mb-2">❌ Error</h2>
              <p className="mb-4">{error}</p>
              <button 
                onClick={() => window.location.href = '/multiplayer'}
                className="px-4 py-2 bg-white text-red-500 rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                Back to Lobby
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="font-sans min-h-screen p-6 sm:p-10" style={{backgroundColor: '#36454f'}}>
        <main className="flex flex-col gap-6 items-center w-full max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-white">🃏 Huzur Multiplayer</h1>
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            Loading game state...
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="font-sans min-h-screen p-3 sm:p-6 lg:p-10" style={{backgroundColor: '#36454f'}}>
      <main className="flex flex-col gap-3 sm:gap-6 items-center w-full max-w-4xl mx-auto">
        {/* Header */}
        <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🃏 Huzur Multiplayer
              </h1>
              <div className="text-sm text-gray-300">Room: {roomId}</div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                className="px-3 py-2 sm:px-4 sm:py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm sm:text-base" 
                onClick={() => window.location.href = '/multiplayer'}
              >
                🚪 Leave Game
              </button>
            </div>
          </div>
        </div>

        {/* Multiplayer Game Component */}
        <MultiplayerGame
          socket={socket}
          roomId={roomId}
          gameState={gameState}
          playerId={socket?.id}
        />
      </main>
    </div>
  );
}

export default function MultiplayerGamePageWrapper() {
  return (
    <ErrorBoundary>
      <MultiplayerGamePage />
    </ErrorBoundary>
  );
}
