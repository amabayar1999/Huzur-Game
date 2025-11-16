"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { io } from 'socket.io-client';
import ErrorBoundary from '../../../../components/ErrorBoundary';
import CleanMultiplayerGame from '../../../../components/MultiplayerGame';
import { generateUUID } from '../../../../lib/uuid';

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
  
  // ✅ Ref guard to prevent duplicate socket setup in React StrictMode
  const socketSetupRef = useRef(false);

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

  // Set a timeout for loading game state - more aggressive automatic loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!gameState && connected) {
        setLoadingTimeout(true);
        console.log('🔄 Timeout reached, requesting room state...');
        
        // Try multiple fallback strategies
        if (socket) {
          // Strategy 1: Request room state
          socket.emit('get_room_state');
          
          // Strategy 2: Try to sync state (only if we're connected and have a playerId)
          if (playerId) {
            socket.emit('sync_state', {}, (response) => {
              if (response && response.ok) {
                console.log('✅ Sync state successful:', response.data);
                setGameState(response.data);
                setError(null);
              } else {
                // ✅ FIX: Better error logging
                const errorMsg = response?.error?.message || response?.message || 'Failed to sync state';
                console.error('❌ Sync state failed:', errorMsg, 'Full response:', JSON.stringify(response, null, 2));
                // Don't set error if it's just "Not in any room" - that's expected if join failed
                if (errorMsg !== 'Not in any room') {
                  setError('Failed to load game state. The room may not exist or the server may be unavailable.');
                }
              }
            });
          }
          
          // Strategy 3: If still no response after 3 more seconds, show error
          setTimeout(() => {
            if (!gameState) {
              setError('Failed to load game state. The room may not exist or the server may be unavailable.');
            }
          }, 3000);
        }
      }
    }, 5000); // ✅ Reduced to 5 seconds for faster automatic loading

    return () => clearTimeout(timeout);
  }, [gameState, connected, socket]);

  useEffect(() => {
    if (!roomId) return;
    
    // ✅ Guard: Prevent duplicate socket setup in React StrictMode
    if (socketSetupRef.current) {
      console.log('⚠️ Socket setup already in progress, skipping duplicate setup');
      return;
    }
    socketSetupRef.current = true;

    // Generate or retrieve stable player ID (same as lobby)
    // ✅ FIX: Use same localStorage key as lobby for consistency
    let userId = localStorage.getItem("playerId") || localStorage.getItem("uid");
    if (!userId) {
      userId = generateUUID();
      localStorage.setItem("playerId", userId);
      localStorage.setItem("uid", userId); // Also set for backward compatibility
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
      
      // Join room with proper ACK handling
      console.log('🎮 Joining room:', roomId, 'with playerId:', userId);
      newSocket.emit('join_room', { roomId, playerId: userId }, (res) => {
        if (!res || res.ok === false) {
          // ✅ FIX: Better error logging
          const errorMsg = res?.error?.message || res?.message || 'Failed to join room';
          console.error('❌ Failed to join room:', errorMsg, 'Full response:', JSON.stringify(res, null, 2));
          setError(errorMsg);
          // Don't try to get room state if we failed to join - the room might not exist
          return;
        }
        console.log('✅ Successfully joined room:', res.data);
        
        // ✅ AUTOMATIC LOADING: If game state is in the ACK response, use it immediately
        if (res.data?.gameState) {
          console.log('🎮 Game state received in join ACK, setting immediately');
          setGameState(res.data.gameState);
          setError(null);
        } else {
          // ✅ AUTOMATIC LOADING: If no game state in ACK, request it immediately
          console.log('🔄 No game state in ACK, requesting immediately');
          newSocket.emit('get_room_state');
        }
        
        // ✅ AUTOMATIC LOADING: Additional fallback sync request after 1 second
        setTimeout(() => {
          if (!gameState && newSocket.connected) {
            console.log('🔄 Fallback automatic sync request');
            newSocket.emit('get_room_state');
          }
        }, 1000);
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
      console.log('🎮 Game state debug:', {
        gameState: data.gameState || data,
        started: (data.gameState || data)?.started,
        gameStarted: (data.gameState || data)?.gameStarted,
        playerCount: (data.gameState || data)?.playerCount,
        players: (data.gameState || data)?.players
      });
      setGameState(data.gameState || data);
      setError(null); // Clear any previous errors
    });

    newSocket.on('room_rejoined', (data) => {
      console.log('♻️ Rejoined room:', data);
      console.log('🎮 Rejoined game state debug:', {
        gameState: data.gameState || data,
        started: (data.gameState || data)?.started,
        gameStarted: (data.gameState || data)?.gameStarted,
        playerCount: (data.gameState || data)?.playerCount,
        players: (data.gameState || data)?.players
      });
      setGameState(data.gameState || data);
      setError(null); // Clear any previous errors
    });

    // Only replace state when a private view is present to avoid wiping hand
    // ✅ FIX: Also update if there's a winner (even if hand is empty/missing)
    const setIfPrivate = (data) => {
      const s = data?.gameState || data;
      const hasHand = Array.isArray(s?.hand);
      const hasScopedHands = s?.playerHands && Object.keys(s.playerHands).length > 0;
      const hasWinner = s?.winner !== undefined && s?.winner !== null;
      if (hasHand || hasScopedHands || hasWinner) {
        setGameState(s);
      }
    };

    newSocket.on('player_joined', (data) => {
      console.log('👤 Player joined:', data);
      setIfPrivate(data);
    });

    newSocket.on('player_left', (data) => {
      console.log('👋 Player left:', data);
      setIfPrivate(data);
    });

    newSocket.on('player_reconnected', (data) => {
      console.log('♻️ Player reconnected:', data);
      setIfPrivate(data);
    });

    // Handle game start: receive per-player public state including dealt hand
    const handleGameStarted = (data) => {
      console.log('🎮 Game started event received:', data);
      
      // ✅ Guard: Prevent duplicate game start processing
      const gameStateData = data.gameState || data;
      
      // ✅ Use userId from closure (not from state which might be null)
      const currentUserId = userId; // Use userId from the outer scope
      
      // Use functional update to check current state
      setGameState((currentState) => {
        const currentStarted = currentState?.started || currentState?.gameStarted;
        const newStarted = gameStateData?.started || gameStateData?.gameStarted;
        
        if (currentStarted && newStarted) {
          console.log('⚠️ Game already started in state, ignoring duplicate game_started event');
          return currentState; // Don't update if already started
        }
        
        // ③ CLIENT DEBUG - Check received hand using currentUserId
        const receivedHand = gameStateData.hand || gameStateData.playerHands?.[currentUserId];
        console.log("🎮 CLIENT DEBUG – received hand:",
          receivedHand || "NOT FOUND",
          "hand length:", receivedHand?.length || 0,
          "playerId (userId):", currentUserId,
          "playerHands keys:", gameStateData.playerHands ? Object.keys(gameStateData.playerHands) : "N/A",
          "full playerHands:", gameStateData.playerHands,
          "gameState.hand:", gameStateData.hand);
        
        return gameStateData; // Update to new state
      });
      
      setError(null);
    };
    
    newSocket.on('game_started', handleGameStarted);

    newSocket.on('update_state', (data) => {
      console.log('🔄 State updated:', data);
      setIfPrivate(data);
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

    // Error handling (socket error event)
    newSocket.on('error', (data) => {
      // ✅ FIX: Better error logging
      const errorMsg = data?.message || (typeof data === 'string' ? data : JSON.stringify(data));
      console.error('❌ Server error:', errorMsg, 'Full error:', data);
      if (errorMsg) {
        setError(errorMsg);
        if (errorMsg.includes('Room not found')) {
          setTimeout(() => {
            window.location.href = '/multiplayer';
          }, 2000);
        }
      }
    });

    // Handle server errors with proper error codes
    newSocket.on('server_error', (data) => {
      // ✅ FIX: Better error logging
      const errorMsg = data?.message || (typeof data === 'string' ? data : JSON.stringify(data));
      console.error('❌ Server error:', errorMsg, 'Full error:', data);
      setError(errorMsg);
      if (errorMsg.includes('Room not found')) {
        setTimeout(() => {
          window.location.href = '/multiplayer';
        }, 2000);
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

    // ✅ Cleanup on unmount: Remove all listeners explicitly to prevent duplicates
    return () => {
      console.log('🧹 Cleaning up socket listeners');
      
      // Remove all event listeners explicitly
      newSocket.off('connect');
      newSocket.off('disconnect');
      newSocket.off('connect_error');
      newSocket.off('error');
      newSocket.off('room_joined');
      newSocket.off('room_rejoined');
      newSocket.off('player_joined');
      newSocket.off('player_left');
      newSocket.off('player_reconnected');
      newSocket.off('game_started');
      newSocket.off('update_state');
      newSocket.off('room_state');
      newSocket.off('state_synced');
      newSocket.off('server_error');
      newSocket.off('join_room_error');
      
      // Close the socket connection
      newSocket.close();
      
      // Reset the ref guard
      socketSetupRef.current = false;
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
              <div className="flex gap-3 justify-center flex-wrap">
                {isConnectionError && retryCount < 3 && (
                  <button 
                    onClick={retryConnection}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                  >
                    🔄 Retry Connection ({retryCount}/3)
                  </button>
                )}
                <button 
                  onClick={() => {
                    localStorage.removeItem("roomId");
                    window.location.href = '/multiplayer';
                  }}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 transition-colors"
                >
                  🧹 Clear Room & Go to Lobby
                </button>
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
              <div className="text-sm text-yellow-400 mt-2 mb-4">
                Taking longer than expected...
              </div>
            )}
            <div className="mt-4 flex gap-3 justify-center">
              <button 
                onClick={() => {
                  localStorage.removeItem("roomId");
                  window.location.href = '/multiplayer';
                }}
                className="px-4 py-2 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 transition-colors"
              >
                🧹 Clear Room & Go to Lobby
              </button>
              <button 
                onClick={() => window.location.href = '/multiplayer'}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
              >
                Back to Lobby
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
                onClick={() => {
                  if (socket) {
                    // Emit leave_room event
                    socket.emit('leave_room');
                    
                    // Listen for confirmation
                    socket.once('room_left', () => {
                      window.location.href = '/multiplayer';
                    });
                    
                    // Fallback: redirect after 1 second even if no confirmation
                    setTimeout(() => {
                      window.location.href = '/multiplayer';
                    }, 1000);
                  } else {
                    // If no socket, just redirect
                    window.location.href = '/multiplayer';
                  }
                }}
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
