"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { io } from 'socket.io-client';
import ErrorBoundary from '../../../../components/ErrorBoundary';
import CleanMultiplayerGame from '../../../../components/MultiplayerGame';

function MultiplayerGamePage() {
  const params = useParams();
  const roomId = params.roomId;
  
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Retry connection function
  const retryConnection = () => {
    if (retryCount < 3) {
      setRetryCount(prev => prev + 1);
      setError(null);
      // Force reconnection by creating new socket
      if (socket) {
        socket.disconnect();
        socket.connect();
      }
    }
  };

  // Set a timeout for loading game state
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!gameState && connected) {
        setLoadingTimeout(true);
        console.log('🔄 Timeout reached, requesting room state...');
        
        // Try multiple fallback strategies
        if (socket) {
          // Strategy 1: Request room state
          socket.emit('get_room_state');
          
          // Strategy 2: Try to sync state
          socket.emit('sync_state', {}, (response) => {
            if (response && response.ok) {
              console.log('✅ Sync state successful:', response.data);
              setGameState(response.data);
              setError(null);
            } else {
              console.error('❌ Sync state failed:', response?.error);
              setError('Failed to load game state. The room may not exist or the server may be unavailable.');
            }
          });
          
          // Strategy 3: If still no response after 5 more seconds, show error
          setTimeout(() => {
            if (!gameState) {
              setError('Failed to load game state. The room may not exist or the server may be unavailable.');
            }
          }, 5000);
        }
      }
    }, 10000); // Reduced to 10 seconds for faster feedback

    return () => clearTimeout(timeout);
  }, [gameState, connected, socket]);

  useEffect(() => {
    if (!roomId) return;

    // Generate or retrieve stable player ID (same as lobby)
    let userId = localStorage.getItem("uid");
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem("uid", userId);
    }

    // Initialize socket connection to clean server
    const newSocket = io('http://localhost:4000', {
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
      
      // Join room with proper ACK handling
      console.log('🎮 Joining room:', roomId);
      newSocket.emit('join_room', { roomId, playerId: userId }, (res) => {
        if (!res?.ok) {
          console.error('❌ Failed to join room:', res?.error);
          setError(res?.error?.message || 'Failed to join room');
          return;
        }
        console.log('✅ Successfully joined room:', res.data);
        // Game state will be received via room_joined event
      });
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

    // Handle transport errors
    newSocket.on('error', (err) => {
      console.error('❌ Socket error:', err);
      if (err.message && err.message.includes('xhr poll error')) {
        setError('Network error: Please check your connection and try refreshing the page.');
      }
    });

    // Game events
    newSocket.on('room_joined', (data) => {
      console.log('👤 Joined room:', data);
      setGameState(data.gameState || data);
      setError(null); // Clear any previous errors
    });

    newSocket.on('room_rejoined', (data) => {
      console.log('♻️ Rejoined room:', data);
      setGameState(data.gameState || data);
      setError(null); // Clear any previous errors
    });

    newSocket.on('player_joined', (data) => {
      console.log('👤 Player joined:', data);
      setGameState(data.gameState || data);
    });

    newSocket.on('player_left', (data) => {
      console.log('👋 Player left:', data);
      setGameState(data.gameState || data);
    });

    newSocket.on('player_reconnected', (data) => {
      console.log('♻️ Player reconnected:', data);
      setGameState(data.gameState || data);
    });

    newSocket.on('update_state', (data) => {
      console.log('🔄 State updated:', data);
      setGameState(data.gameState || data);
    });

    newSocket.on('room_state', (data) => {
      console.log('🏠 Room state:', data);
      setGameState(data.gameState || data);
    });

    // Sync/refresh events
    newSocket.on('state_synced', (data) => {
      console.log('🔄 State synced:', data);
      setGameState(data.gameState || data);
      setSyncing(false);
    });

    // Error handling
    newSocket.on('error', (data) => {
      console.error('❌ Server error:', data);
      if (data && data.message) {
        setError(data.message);
        // If it's a room not found error, redirect back to lobby
        if (data.message.includes('Room not found') || data.message.includes('Room not found')) {
          setTimeout(() => {
            window.location.href = '/multiplayer';
          }, 2000);
        }
      }
    });

    // Handle server errors with proper error codes
    newSocket.on('server_error', (data) => {
      console.error('❌ Server error:', data);
      if (data && data.message) {
        setError(data.message);
        // If it's a room not found error, redirect back to lobby
        if (data.message.includes('Room not found') || data.message.includes('Room not found')) {
          setTimeout(() => {
            window.location.href = '/multiplayer';
          }, 2000);
        }
      }
    });

    // Handle join room errors specifically
    newSocket.on('join_room_error', (data) => {
      console.error('❌ Join room error:', data);
      if (data && data.message) {
        setError(data.message);
        // If it's a room not found error, redirect back to lobby
        if (data.message.includes('Room not found') || data.message.includes('Room not found')) {
          setTimeout(() => {
            window.location.href = '/multiplayer';
          }, 2000);
        }
      }
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
    const isConnectionError = error.includes('xhr poll error') || error.includes('polling') || error.includes('Connection error') || error.includes('Network error');
    
    return (
      <div className="font-sans min-h-screen p-6 sm:p-10" style={{backgroundColor: '#36454f'}}>
        <main className="flex flex-col gap-6 items-center w-full max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-white">🃏 Huzur Multiplayer</h1>
          <div className="bg-red-500/90 backdrop-blur-sm rounded-xl shadow-lg border border-red-400/30 p-6 text-center">
            <div className="text-white">
              <h2 className="text-xl font-bold mb-2">❌ Error</h2>
              <p className="mb-4">{error}</p>
              <div className="flex gap-3 justify-center">
                {isConnectionError && retryCount < 3 && (
                  <button 
                    onClick={retryConnection}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                  >
                    🔄 Retry Connection ({retryCount}/3)
                  </button>
                )}
                <button 
                  onClick={() => window.location.href = '/multiplayer'}
                  className="px-4 py-2 bg-white text-red-500 rounded-lg font-medium hover:bg-gray-100 transition-colors"
                >
                  Back to Lobby
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!gameState && !error) {
    return (
      <div className="font-sans min-h-screen p-6 sm:p-10" style={{backgroundColor: '#36454f'}}>
        <main className="flex flex-col gap-6 items-center w-full max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-white">🃏 Huzur Multiplayer</h1>
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            <div>Loading game state...</div>
            <div className="text-sm text-gray-300 mt-2">
              Room: {roomId}
            </div>
            <div className="text-sm text-gray-300">
              Status: {connected ? 'Connected' : 'Connecting...'}
            </div>
            {loadingTimeout && (
              <div className="text-sm text-yellow-400 mt-2">
                Taking longer than expected...
              </div>
            )}
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
              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-300">Room: {roomId}</div>
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} title={connected ? 'Connected' : 'Disconnected'}></div>
                {syncing && <div className="text-xs text-blue-400">Syncing...</div>}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                className={`px-3 py-2 sm:px-4 sm:py-2 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm sm:text-base ${
                  syncing 
                    ? 'bg-blue-400 cursor-not-allowed' 
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
                onClick={() => {
                  if (!syncing && socket) {
                    setSyncing(true);
                    setError(null); // Clear any existing errors
                    
                    socket.emit('sync_state', {}, (response) => {
                      setSyncing(false);
                      if (response && !response.ok) {
                        setError(response.error?.message || 'Failed to sync state');
                      }
                    });
                    
                    // Set a timeout to reset syncing state if no response
                    setTimeout(() => {
                      setSyncing(false);
                    }, 5000); // Reset after 5 seconds if no response
                  }
                }}
                disabled={syncing}
                title="Sync game state with server"
              >
                {syncing ? '🔄 Syncing...' : '🔄 Sync'}
              </button>
              <button 
                className="px-3 py-2 sm:px-4 sm:py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm sm:text-base" 
                onClick={() => {
                  if (socket) {
                    setError(null); // Clear any existing errors
                    socket.emit('get_room_state');
                  }
                }}
                title="Refresh room state"
              >
                🔄 Refresh
              </button>
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
        <CleanMultiplayerGame
          socket={socket}
          roomId={roomId}
          gameState={gameState}
          playerId={playerId}
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
