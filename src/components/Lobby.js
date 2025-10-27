"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Lobby({ socket, playerId }) {
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [canJoin, setCanJoin] = useState(true);
  const [canSpectate, setCanSpectate] = useState(false);
  const [oldPlayerId, setOldPlayerId] = useState(null);
  const router = useRouter();

  // Handle server events
  useEffect(() => {
    if (!socket) return;

    // Debug: Log all socket events
    socket.onAny((event, ...args) => {
      console.log("📡 [socket event]", event, args);
    });

    // Store old player ID when connecting
    socket.on('connect', () => {
      if (!oldPlayerId) {
        setOldPlayerId(socket.id);
      }
    });

    // Handle reconnection
    socket.on('reconnect', () => {
      console.log('🔄 Socket reconnected, attempting to rejoin room...');
      if (roomId && oldPlayerId && oldPlayerId !== socket.id) {
        // Try to reconnect with old player ID
        handleReconnectToRoom();
      }
    });

    // Room created
    socket.on('room_created', (data) => {
      setGameState(data.gameState);
      setRoomId(data.roomId);
      setError(null);
      console.log('Room created:', data);
      
      // Debug: Log the created room state
      console.log('Created room state:', {
        roomId: data.roomId,
        playerCount: data.gameState?.playerCount || data.gameState?.players?.length,
        canStart: data.gameState?.canStart,
        roomOwner: data.gameState?.roomOwner,
        currentPlayerId: playerId,
        isRoomOwner: data.gameState?.roomOwner === playerId
      });
    });

    // Room joined
    socket.on('room_joined', (data) => {
      setGameState(data.gameState);
      setRoomId(data.roomId);
      setError(null);
      console.log('Room joined:', data);
      
      // Debug: Log the joined room state
      console.log('Joined room state:', {
        roomId: data.roomId,
        playerCount: data.gameState?.playerCount || data.gameState?.players?.length,
        canStart: data.gameState?.canStart,
        roomOwner: data.gameState?.roomOwner,
        currentPlayerId: playerId,
        isRoomOwner: data.gameState?.roomOwner === playerId
      });
    });

    // Room rejoined (for reconnections)
    socket.on('room_rejoined', (data) => {
      setGameState(data.gameState);
      setRoomId(data.roomId);
      setError(null);
      console.log('Room rejoined:', data);
      
      // Navigate to game if it's started
      if (data.gameState && data.gameState.gameStarted) {
        router.push(`/multiplayer/game/${data.roomId}`);
      }
    });

    // Player joined
    socket.on('player_joined', (data) => {
      setGameState(data);
      console.log('Player joined:', data);
      
      // Debug: Log the updated state
      console.log('Updated game state after player joined:', {
        playerCount: data.playerCount || data.players?.length,
        canStart: data.canStart,
        roomOwner: data.roomOwner,
        currentPlayerId: playerId,
        isRoomOwner: data.roomOwner === playerId
      });
    });

    // Player left
    socket.on('player_left', (data) => {
      setGameState(data);
      console.log('Player left:', data);
    });

    // Game started - unified handler
    const handleGameStarted = (data) => {
      console.log("🎮 Game started event received:", data);
      console.log("🧾 raw game_started data:", JSON.stringify(data, null, 2));
      console.log("🎮 About to update state...");

      const state = data.gameState || data;
      setGameState(state);
      console.log("🎮 Game state updated, navigating...");

      // Ensure we have a valid roomId
      const targetRoomId = state.roomId || roomId;
      if (!targetRoomId) {
        console.error('❌ No roomId found in game_started payload:', data);
        setError('Game started but missing room ID');
        return;
      }

      console.log('🎮 Navigating to game room:', targetRoomId);
      router.push(`/multiplayer/game/${targetRoomId}`);
    };

    socket.on('game_started', handleGameStarted);

    // ✅ FIX: Handle game already started notification
    socket.on('game_already_started', (data) => {
      console.log('🎮 Game already started notification:', data);
      // Navigate to game room if game is already started
      if (data.roomId) {
        console.log('🎮 Navigating to game room...');
        router.push(`/multiplayer/game/${data.roomId}`);
      }
    });

    // Add reconnected event handler
    socket.on('reconnected', (data) => {
      console.log('🔄 Successfully reconnected:', data);
      setGameState(data.gameState);
      setRoomId(data.roomId);
      setError(null);
      
      // Navigate to game if it's started
      if (data.gameState && data.gameState.gameStarted) {
        router.push(`/multiplayer/game/${data.roomId}`);
      }
    });

    // Update state
    socket.on('update_state', (data) => {
      setGameState(data);
      console.log('State updated:', data);
    });

    // ✅ FIX: Handle server errors with proper error codes
    socket.on('server_error', (data) => {
      console.log('Server error:', data);
      if (data?.code === 'GAME_ALREADY_STARTED') {
        // ✅ Don't treat this as an error - it's handled by game_already_started event
        console.log('🎮 Game already started - handled by game_already_started event');
        setCanJoin(false);
        setCanSpectate(true);
      } else {
        setError(data?.message || 'Server error occurred');
      }
      setLoading(false);
    });

    // ✅ FIX: Simplified error handler - only handle connection errors
    socket.on('error', (error) => {
      console.warn('Socket error event:', error);
      
      // Only handle connection/authentication errors, not game rule violations
      if (error?.message?.includes('Connection') || 
          error?.message?.includes('Authentication') ||
          error?.message?.includes('Not in any room')) {
        setError(error?.message || 'Connection error');
        setLoading(false);
      }
      // Game rule violations are handled by specific game events
    });

    // Rooms list
    socket.on('rooms_list', (data) => {
      setRooms(data.rooms);
      console.log('Available rooms:', data.rooms);
    });

    return () => {
      socket.offAny();
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('player_joined');
      socket.off('player_left');
      socket.off('game_started', handleGameStarted);
      socket.off('game_already_started');
      socket.off('update_state');
      socket.off('server_error');
      socket.off('error');
      socket.off('rooms_list');
    };
  }, [socket, oldPlayerId, roomId, router]);

  // Add reconnection handler
  const handleReconnectToRoom = () => {
    if (!socket || !roomId || !oldPlayerId) return;
    
    setLoading(true);
    setError(null);
    
    socket.emit('join_room', { 
      roomId, 
      oldPlayerId: oldPlayerId !== socket.id ? oldPlayerId : null 
    }, (res) => {
      setLoading(false);
      
      if (!res?.ok) {
        console.error('❌ Reconnection failed:', res?.error || res);
        setError(res?.error?.message || 'Failed to reconnect to room');
        return;
      }
      
      console.log('✅ Successfully reconnected to room');
    });
  };

  // Create room
  const handleCreateRoom = () => {
    if (!socket) return;
    
    setLoading(true);
    setError(null);
    
    // ✅ FIX: Use ACK callback for proper error handling and send playerId
    socket.emit('create_room', { 
      roomId: '', 
      playerId: playerId // Send the stable playerId
    }, (res) => {
      setLoading(false);
      
      if (!res?.ok) {
        console.error('❌ create_room failed:', res?.error || res);
        setError(res?.error?.message || 'Failed to create room');
        return;
      }
      
      // Success is handled by the 'room_created' event
      console.log('✅ Room creation ACK received:', res.data);
    });
  };

  // Join room
  const handleJoinRoom = () => {
    if (!socket || !roomId.trim()) return;
    
    // ✅ FIX: Prevent joining if game is already started
    if (gameState && gameState.gameStarted) {
      setError('This game already started. You can observe or wait for the next round.');
      setCanJoin(false);
      setCanSpectate(true);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    // ✅ FIX: Use ACK-based error handling with stable playerId
    socket.emit('join_room', { 
      roomId: roomId.trim(),
      playerId: playerId // Send stable playerId
    }, (res) => {
      setLoading(false);
      
      if (!res?.ok) {
        console.error('❌ join_room failed:', res?.error || res);
        
        // ✅ FIX: Handle specific error codes
        if (res?.error?.code === 'GAME_ALREADY_STARTED') {
          // ✅ Don't treat this as an error - it's handled by game_already_started event
          console.log('🎮 Game already started - handled by game_already_started event');
          setCanJoin(false);
          setCanSpectate(true);
          return;
        }
        
        setError(res?.error?.message || 'Failed to join room');
        return;
      }
      
      // ✅ FIX: Handle spectator mode
      if (res?.data?.isSpectator) {
        console.log('✅ Joined as spectator:', res.data);
        setCanJoin(false);
        setCanSpectate(true);
      }
      
      // Success is handled by the 'room_joined' event
      console.log('✅ Room join ACK received:', res.data);
    });
  };

  // Start game
  const handleStartGame = async () => {
    if (!socket || gameState?.gameStarted) return; // ✅ prevent duplicate emits
    
    // ✅ Additional validation: Check if we actually have enough players
    if (!gameState?.canStart) {
      setError("Cannot start game: Need at least 2 players");
      return;
    }
    
    setLoading(true);
    setError(null);

    // ✅ UI-side fail-safe timeout
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.warn("⚠️ start_game timeout, forcing UI reset");
        setLoading(false);
        setError("Game start timed out. Please try again.");
      }
    }, 7000);

    socket.emit("start_game", { playerId }, (res) => {
      clearTimeout(timeoutId); // ✅ Clear timeout on successful ACK
      setLoading(false);
      if (!res?.ok) {
        const errorMessage = res?.error?.message || "Failed to start game";
        setError(errorMessage);
        console.error("❌ start_game failed:", res?.error || res);
        
        // ✅ Handle specific error codes
        if (res?.error?.code === 'GAME_START_FAILED') {
          console.log("🎮 Game start failed - refreshing game state");
          // Request fresh game state to update UI
          socket.emit('get_room_state');
        } else if (res?.error?.code === 'NOT_ROOM_OWNER') {
          console.log("🎮 Player is not room owner - refreshing game state");
          // Request fresh game state to update UI
          socket.emit('get_room_state');
        }
        return;
      }

      console.log("✅ Game start ACK received:", res.data);
      // Optional: update local state immediately
      if (res.data?.gameState?.gameStarted) setGameState(res.data.gameState);
    });
  };

  // Get available rooms
  const handleGetRooms = () => {
    if (!socket) return;
    
    socket.emit('get_rooms');
  };

  // Join specific room
  const handleJoinSpecificRoom = (targetRoomId) => {
    if (!socket) return;
    
    setLoading(true);
    setError(null);
    
    // ✅ FIX: Use ACK callback for proper error handling with stable playerId
    socket.emit('join_room', { 
      roomId: targetRoomId,
      playerId: playerId // Send stable playerId
    }, (res) => {
      setLoading(false);
      
      if (!res?.ok) {
        console.error('❌ join_room failed:', res?.error || res);
        
        // Handle specific error codes
        if (res?.error?.code === 'GAME_ALREADY_STARTED') {
          // ✅ Don't treat this as an error - it's handled by game_already_started event
          console.log('🎮 Game already started - handled by game_already_started event');
          setCanJoin(false);
          setCanSpectate(true);
          return;
        }
        
        setError(res?.error?.message || 'Failed to join room');
        return;
      }
      
      // ✅ FIX: Handle spectator mode
      if (res?.data?.isSpectator) {
        console.log('✅ Joined as spectator:', res.data);
        setCanJoin(false);
        setCanSpectate(true);
      }
      
      // Success is handled by the 'room_joined' event
      console.log('✅ Room join ACK received:', res.data);
    });
  };

  // Check if current player is room owner
  const isRoomOwner = gameState?.roomOwner === playerId;
  const canStartGame = gameState?.canStart && isRoomOwner;
  
  // Debug logging for start game button
  console.log('🎮 Start Game Button Debug:', {
    playerId,
    roomOwner: gameState?.roomOwner,
    isRoomOwner,
    canStart: gameState?.canStart,
    canStartGame,
    playerCount: gameState?.playerCount || gameState?.players?.length,
    started: gameState?.started,
    gameStarted: gameState?.gameStarted
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">🎮 Huzur Multiplayer</h1>
          <p className="text-gray-300 text-lg">Clean Architecture - Server Authoritative</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/90 backdrop-blur-sm rounded-xl shadow-lg border border-red-400/30 p-4 text-center mb-6">
            <p className="text-white font-medium mb-4">{error}</p>
            
            {/* ✅ Enhanced error actions for game already started */}
            {error.includes('Game already started') && (
              <div className="flex gap-3 justify-center">
                <button 
                  onClick={() => router.push(`/multiplayer/game/${roomId}`)}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  👁️ Spectate Game
                </button>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  🔄 Refresh Page
                </button>
                <button 
                  onClick={() => setError(null)}
                  className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  ✕ Dismiss
                </button>
              </div>
            )}
            
            {/* Generic error actions */}
            {!error.includes('Game already started') && (
              <div className="flex gap-3 justify-center">
                <button 
                  onClick={() => setError(null)}
                  className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  ✕ Dismiss
                </button>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  🔄 Refresh Page
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Create Room */}
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-6">
            <h2 className="text-2xl font-bold text-white mb-4">🏠 Create Room</h2>
            <p className="text-gray-300 mb-4">Start a new game room and invite friends to join.</p>
            
            <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="text-blue-400 text-sm font-semibold mb-1">📋 How it works:</div>
              <ul className="text-xs text-gray-300 space-y-1">
                <li>• You become the room owner</li>
                <li>• Share the Room ID with a friend</li>
                <li>• Start the game when both players are ready</li>
              </ul>
            </div>
            
            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="w-full px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : '🎮 Create New Room'}
            </button>
          </div>

          {/* Join Room */}
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-6">
            <h2 className="text-2xl font-bold text-white mb-4">🚪 Join Room</h2>
            <p className="text-gray-300 mb-4">Enter a room ID to join an existing game.</p>
            
            <div className="mb-6 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <div className="text-purple-400 text-sm font-semibold mb-1">📋 How to join:</div>
              <ul className="text-xs text-gray-300 space-y-1">
                <li>• Get the Room ID from the room creator</li>
                <li>• Enter it below and click Join</li>
                <li>• Wait for the room owner to start the game</li>
              </ul>
            </div>
            
            <div className="space-y-4">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter Room ID (e.g., abc123)"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              
              <button
                onClick={handleJoinRoom}
                disabled={loading || !roomId.trim() || !canJoin}
                className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg disabled:cursor-not-allowed"
              >
                {loading ? 'Joining...' : canJoin ? '🚪 Join Room' : '🎮 Game Started'}
              </button>
              
              {/* Spectate button when game has started */}
              {canSpectate && (
                <button
                  onClick={() => router.push(`/multiplayer/game/${roomId}`)}
                  className="w-full px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  👁️ Spectate Game
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Available Rooms */}
        <div className="mt-8 bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">🏠 Available Rooms</h2>
            <button
              onClick={handleGetRooms}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
            >
              🔄 Refresh
            </button>
          </div>
          
          {rooms.length === 0 ? (
            <p className="text-gray-300 text-center py-4">No rooms available. Create one to get started!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <div key={room.roomId} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-gray-300">{room.roomId}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      room.status === 'Reconnecting'
                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        : room.gameStarted 
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                          : 'bg-green-500/20 text-green-400 border border-green-500/30'
                    }`}>
                      {room.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 mb-3">
                    {room.playerCount} player{room.playerCount !== 1 ? 's' : ''}
                    {room.hasDisconnectedPlayers && (
                      <span className="block text-xs text-yellow-400 mt-1">
                        ⏰ Players reconnecting...
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleJoinSpecificRoom(room.roomId)}
                    disabled={loading || room.status === 'Reconnecting'}
                    className={`w-full px-3 py-2 rounded text-sm font-medium transition-all duration-200 ${
                      room.status === 'Reconnecting'
                        ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                        : 'bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 text-white disabled:cursor-not-allowed'
                    }`}
                  >
                    {room.status === 'Reconnecting' ? 'Reconnecting...' : 'Join'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current Room Status */}
        {gameState && (
          <div className="mt-8 bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-6">
            <h2 className="text-2xl font-bold text-white mb-4">🎮 Current Room</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Room ID:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white bg-gray-700 px-2 py-1 rounded">{roomId}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(roomId)}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                    title="Copy Room ID"
                  >
                    📋
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Players:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white">{gameState.playerCount || gameState.players?.length || 0}/2</span>
                  {gameState.playerCount < 2 && (
                    <span className="text-yellow-400 text-xs">⚠️ Need 2 players</span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Status:</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  gameState.started || gameState.gameStarted
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                }`}>
                  {gameState.started || gameState.gameStarted ? 'Game Started' : 'Waiting'}
                </span>
              </div>

              {/* Room Owner Status */}
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Room Owner:</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  isRoomOwner 
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                    : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                }`}>
                  {isRoomOwner ? 'You' : 'Another Player'}
                </span>
              </div>
            </div>

            {/* Players List */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-white mb-3">Players</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(gameState.players || []).map((player, index) => (
                  <div key={player.id} className={`rounded-lg p-3 text-center ${
                    player.id === playerId ? 'bg-blue-500/30 border border-blue-400' : 'bg-gray-600/50'
                  }`}>
                    <div className="text-sm text-gray-300">Player {index + 1}</div>
                    <div className="text-xs text-gray-400 font-mono truncate">
                      {player.id === playerId ? 'You' : player.id}
                    </div>
                    <div className="text-xs text-gray-400">
                      {player.cardCount} cards
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Start Game Button */}
            {canStartGame && (
              <div className="mt-6 text-center">
                <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="text-green-400 font-semibold mb-2">✅ Ready to Start!</div>
                  <div className="text-sm text-gray-300">
                    You have 2 players and you're the room owner. Click below to begin the game.
                  </div>
                </div>
                <button
                  onClick={handleStartGame}
                  disabled={loading}
                  className="px-8 py-3 bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg disabled:cursor-not-allowed"
                >
                  {loading ? 'Starting...' : '🎮 Start Game'}
                </button>
              </div>
            )}

            {/* Waiting States */}
            {!canStartGame && !gameState.started && !gameState.gameStarted && (
              <div className="mt-6 text-center">
                {isRoomOwner ? (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div className="text-yellow-400 font-semibold mb-2">⏳ Waiting for Players</div>
                    <div className="text-sm text-gray-300 mb-3">
                      You need 1 more player to start the game. Share the Room ID with a friend!
                    </div>
                    <div className="text-xs text-gray-400">
                      Room ID: <span className="font-mono bg-gray-700 px-2 py-1 rounded">{roomId}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <div className="text-blue-400 font-semibold mb-2">⏳ Waiting for Room Owner</div>
                    <div className="text-sm text-gray-300">
                      The room owner will start the game once ready. You'll be notified when it begins.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Game Started - Navigate to Game */}
            {(gameState.started || gameState.gameStarted) && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => router.push(`/multiplayer/game/${roomId}`)}
                  className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                >
                  🎮 Enter Game
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
