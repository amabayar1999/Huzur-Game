"use client";

import { useEffect, useState } from 'react';

export default function Lobby({ 
  socket, 
  connected, 
  currentRoom, 
  gameState, 
  onCreateRoom, 
  onJoinRoom, 
  onLeaveRoom, 
  onStartGame, 
  onGetRooms 
}) {
  const [roomId, setRoomId] = useState('');
  const [availableRooms, setAvailableRooms] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (socket) {
      // Listen for rooms list updates
      socket.on('rooms_list', (data) => {
        setAvailableRooms(data.rooms);
      });

      // Get initial rooms list
      onGetRooms();
    }
  }, [socket, onGetRooms]);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      onCreateRoom(roomId.trim());
      setRoomId('');
      setShowCreateForm(false);
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      onJoinRoom(roomId.trim());
      setRoomId('');
    }
  };

  const refreshRooms = () => {
    onGetRooms();
  };

  if (currentRoom) {
    // Show room status
    return (
      <div className="w-full bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">🏠 Room: {currentRoom}</h2>
            <button 
              onClick={onLeaveRoom}
              className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm"
            >
              Leave Room
            </button>
          </div>
          
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">👥 Players ({gameState?.players?.length || 0}/4)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {gameState?.players?.map((playerId, index) => (
                <div key={playerId} className="bg-gray-600/50 rounded-lg p-3 text-center">
                  <div className="text-sm text-gray-300">Player {index + 1}</div>
                  <div className="text-xs text-gray-400 font-mono truncate">{playerId}</div>
                </div>
              ))}
              {Array.from({ length: 4 - (gameState?.players?.length || 0) }).map((_, index) => (
                <div key={`empty-${index}`} className="bg-gray-600/30 rounded-lg p-3 text-center border-2 border-dashed border-gray-500">
                  <div className="text-sm text-gray-500">Empty Slot</div>
                </div>
              ))}
            </div>
          </div>

          {gameState?.gameStarted ? (
            <div className="bg-green-500/20 border border-green-400/30 rounded-lg p-4 text-center">
              <h3 className="text-lg font-semibold text-green-400 mb-2">🎮 Game in Progress</h3>
              <p className="text-green-300">Current turn: {gameState.currentTurn === socket?.id ? 'You' : 'Another player'}</p>
              <button 
                onClick={() => window.location.href = `/multiplayer/game/${currentRoom}`}
                className="mt-3 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
              >
                Enter Game
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-center text-gray-300">
                {gameState?.players?.length < 2 ? 
                  'Waiting for more players to join...' : 
                  'Ready to start the game!'
                }
              </div>
              <button 
                onClick={onStartGame}
                disabled={!gameState?.players || gameState.players.length < 2}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
              >
                🎮 Start Game
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show lobby interface
  return (
    <div className="w-full space-y-4">
      {/* Quick Actions */}
      <div className="bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
        <h2 className="text-xl font-bold text-white mb-4">🎮 Quick Actions</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
          >
            🏠 Create Room
          </button>
          <button 
            onClick={refreshRooms}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
          >
            🔄 Refresh Rooms
          </button>
        </div>
      </div>

      {/* Create Room Form */}
      {showCreateForm && (
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
          <h3 className="text-lg font-bold text-white mb-3">🏠 Create New Room</h3>
          <form onSubmit={handleCreateRoom} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID (optional)"
              className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button 
              type="submit"
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
            >
              Create
            </button>
            <button 
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Join Room Form */}
      <div className="bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
        <h3 className="text-lg font-bold text-white mb-3">🚪 Join Existing Room</h3>
        <form onSubmit={handleJoinRoom} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter room ID"
            className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            required
          />
          <button 
            type="submit"
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
          >
            Join
          </button>
        </form>
      </div>

      {/* Available Rooms */}
      <div className="bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-600/30 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">🏠 Available Rooms</h3>
          <button 
            onClick={refreshRooms}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
        
        {availableRooms.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <div className="text-4xl mb-2">🏠</div>
            <p>No rooms available</p>
            <p className="text-sm">Create a new room to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {availableRooms.map((room) => (
              <div key={room.roomId} className="bg-gray-700/50 rounded-lg p-4 border border-gray-600/30">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-white">Room {room.roomId}</h4>
                  <span className="text-xs text-gray-400">
                    {room.playerCount}/{room.maxPlayers} players
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">
                    {room.gameStarted ? '🎮 In Progress' : '⏳ Waiting'}
                  </span>
                  <button 
                    onClick={() => onJoinRoom(room.roomId)}
                    disabled={room.gameStarted}
                    className="px-3 py-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
                  >
                    Join
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
