#!/usr/bin/env node

/**
 * Simple Multiplayer Debug Test
 * Tests each step of the multiplayer flow individually
 */

const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:4000';
const TEST_ROOM_ID = 'debug-room-' + Math.random().toString(36).substr(2, 6);

console.log('🧪 Starting Simple Multiplayer Debug Test...');
console.log('🏠 Test Room ID:', TEST_ROOM_ID);

const socket = io(SERVER_URL, { autoConnect: false });

socket.on('connect', () => {
  console.log('✅ Connected to server:', socket.id);
  
  // Step 1: Create room
  console.log('📦 Creating room...');
  socket.emit('create_room', { roomId: TEST_ROOM_ID }, (res) => {
    console.log('📦 Create room response:', res);
    
    if (res?.ok) {
      // Step 2: Try to start game (should fail - only 1 player)
      console.log('🎮 Attempting to start game with 1 player...');
      socket.emit('start_game', {}, (res) => {
        console.log('🎮 Start game response:', res);
        
        // Cleanup
        socket.disconnect();
        process.exit(0);
      });
    } else {
      console.error('❌ Failed to create room:', res?.error);
      socket.disconnect();
      process.exit(1);
    }
  });
});

socket.on('room_created', (data) => {
  console.log('📦 Room created event:', data);
});

socket.on('error', (error) => {
  console.error('❌ Socket error:', error);
  process.exit(1);
});

socket.on('server_error', (error) => {
  console.error('❌ Server error:', error);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error);
  process.exit(1);
});

// Start the test
socket.connect();

// Timeout after 10 seconds
setTimeout(() => {
  console.error('⏰ Test timed out');
  socket.disconnect();
  process.exit(1);
}, 10000);
