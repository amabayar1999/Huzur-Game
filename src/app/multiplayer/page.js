"use client";

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import ErrorBoundary from '../../components/ErrorBoundary';
import Lobby from '../../components/Lobby';
import { generateUUID } from '../../lib/uuid';

function MultiplayerLobby() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 🪪 Generate or retrieve stable player ID (consistent with Lobby)
    let userId = localStorage.getItem("playerId") || localStorage.getItem("uid");
    if (!userId) {
      userId = generateUUID();
      localStorage.setItem("playerId", userId);
      // Also set uid for backward compatibility
      localStorage.setItem("uid", userId);
    } else {
      // Ensure both keys are set for consistency
      localStorage.setItem("playerId", userId);
      localStorage.setItem("uid", userId);
    }
    
    // Initialize socket connection to clean server
    // Get the server URL dynamically based on current hostname
    const getServerUrl = () => {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        // Use the current hostname with port 4000
        return `http://${hostname}:4000`;
      }
      return 'http://localhost:4000'; // Fallback for SSR
    };
    
    const newSocket = io(getServerUrl(), {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true,
      transports: ['polling', 'websocket'], // Start with polling, then upgrade to websocket
      upgrade: true,
      rememberUpgrade: false
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log('🔌 Connected to server:', newSocket.id);
      setConnected(true);
      setPlayerId(userId); // Use stable userId instead of socket.id
      setError(null);
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
      setConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ Connection error:', err);
      console.error('❌ Error details:', {
        message: err.message,
        description: err.description,
        context: err.context,
        type: err.type
      });
      
      if (err.message.includes('xhr poll error') || err.message.includes('polling')) {
        setError('Network error: Please check your connection and try refreshing the page.');
      } else if (err.message.includes('websocket')) {
        setError('WebSocket connection failed. The server may be overloaded. Try refreshing the page.');
      } else {
        setError('Failed to connect to server. Make sure the server is running on port 4000.');
      }
    });

    // Error handling
    newSocket.on('error', (data) => {
      console.error('❌ Server error:', data);
      if (data && data.message) {
        setError(data.message);
      }
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  if (!connected && !error) {
    return (
      <div className="font-sans min-h-screen p-6 sm:p-10" style={{backgroundColor: '#36454f'}}>
        <main className="flex flex-col gap-6 items-center w-full max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-white">🃏 Huzur Multiplayer</h1>
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            Connecting to server...
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
              <h2 className="text-xl font-bold mb-2">❌ Connection Error</h2>
              <p className="mb-4">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-white text-red-500 rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                Retry Connection
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="font-sans min-h-screen p-3 sm:p-6 lg:p-10" style={{backgroundColor: '#36454f'}}>
      <main className="flex flex-col gap-3 sm:gap-6 items-center w-full max-w-4xl mx-auto">
        <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🃏 Huzur Multiplayer
              </h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-300">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                className="px-3 py-2 sm:px-4 sm:py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm sm:text-base" 
                onClick={() => window.location.href = '/card_game'}
              >
                🎮 Single Player
              </button>
            </div>
          </div>
        </div>

        <Lobby
          socket={socket}
          playerId={playerId}
        />
      </main>
    </div>
  );
}

export default function MultiplayerPage() {
  return (
    <ErrorBoundary>
      <MultiplayerLobby />
    </ErrorBoundary>
  );
}
