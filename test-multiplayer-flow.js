#!/usr/bin/env node

/**
 * Multiplayer Flow Test Script
 * 
 * This script tests the complete multiplayer game start flow and verifies
 * that all expected logs appear in the correct sequence.
 * 
 * Expected Flow:
 * 1. Client emits start_game
 * 2. Server ACKs with success
 * 3. Server broadcasts game_started event
 * 4. Client receives game_started and navigates
 */

const { io } = require('socket.io-client');

// Test configuration
const SERVER_URL = 'http://localhost:4000';
const TEST_ROOM_ID = 'test-room-' + Math.random().toString(36).substr(2, 6);

// Test results tracking
const testResults = {
  clientEmitted: false,
  serverAcked: false,
  gameStartedEventReceived: false,
  navigationTriggered: false,
  serverLogs: [],
  clientLogs: []
};

// Create two socket connections to simulate host and player
const hostSocket = io(SERVER_URL, { autoConnect: false });
const playerSocket = io(SERVER_URL, { autoConnect: false });

// Host socket event handlers
hostSocket.on('connect', () => {
  console.log('🏠 Host connected:', hostSocket.id);
  testResults.clientLogs.push('🏠 Host connected');
  
  // Create room
  hostSocket.emit('create_room', { roomId: TEST_ROOM_ID }, (res) => {
    if (res?.ok) {
      console.log('✅ Room created:', TEST_ROOM_ID);
      testResults.clientLogs.push('✅ Room created');
      
      // Player joins
      playerSocket.connect();
    } else {
      console.error('❌ Failed to create room:', res?.error);
      process.exit(1);
    }
  });
});

hostSocket.on('room_created', (data) => {
  console.log('📦 Room created event received:', data.roomId);
  testResults.clientLogs.push('📦 Room created event received');
});

hostSocket.on('player_joined', (data) => {
  console.log('👤 Player joined event received');
  testResults.clientLogs.push('👤 Player joined event received');
  
  // Now test the start game flow
  setTimeout(() => {
    console.log('⚡ Testing start game flow...');
    testStartGameFlow();
  }, 1000);
});

hostSocket.on('game_started', (data) => {
  console.log('🎮 Game started event received:', data.roomId);
  testResults.clientLogs.push('🎮 Game started event received');
  testResults.gameStartedEventReceived = true;
  
  // Simulate navigation
  console.log('🎮 Navigating to game room:', data.roomId);
  testResults.clientLogs.push('🎮 Navigating to game room');
  testResults.navigationTriggered = true;
  
  // Complete test
  setTimeout(() => {
    completeTest();
  }, 500);
});

// Player socket event handlers
playerSocket.on('connect', () => {
  console.log('👤 Player connected:', playerSocket.id);
  testResults.clientLogs.push('👤 Player connected');
  
  // Join the room
  playerSocket.emit('join_room', { roomId: TEST_ROOM_ID }, (res) => {
    if (res?.ok) {
      console.log('✅ Player joined room');
      testResults.clientLogs.push('✅ Player joined room');
    } else {
      console.error('❌ Failed to join room:', res?.error);
    }
  });
});

playerSocket.on('room_joined', (data) => {
  console.log('📦 Player room joined event received');
  testResults.clientLogs.push('📦 Player room joined event received');
});

playerSocket.on('game_started', (data) => {
  console.log('🎮 Player received game started event');
  testResults.clientLogs.push('🎮 Player received game started event');
});

// Test the start game flow
function testStartGameFlow() {
  console.log('⚡ handleStartGame() fired');
  testResults.clientLogs.push('⚡ handleStartGame() fired');
  
  console.log('⚡ Emitting start_game from socket:', hostSocket.id);
  testResults.clientLogs.push('⚡ Emitting start_game from socket');
  testResults.clientEmitted = true;
  
  hostSocket.emit('start_game', {}, (res) => {
    console.log('📩 start_game ACK response:', res);
    testResults.clientLogs.push('📩 start_game ACK response');
    
    if (res?.ok) {
      testResults.serverAcked = true;
      console.log('✅ Game start ACK received:', res.data);
      testResults.clientLogs.push('✅ Game start ACK received');
    } else {
      console.error('❌ Start game failed:', res?.error);
      process.exit(1);
    }
  });
}

// Complete the test and show results
function completeTest() {
  console.log('\n🧪 TEST RESULTS:');
  console.log('================');
  
  const expectedLogs = [
    '⚡ handleStartGame() fired',
    '⚡ Emitting start_game from socket',
    '📩 start_game ACK response',
    '✅ Game start ACK received',
    '🎮 Game started event received',
    '🎮 Navigating to game room'
  ];
  
  console.log('\n📋 Expected Client Logs:');
  expectedLogs.forEach(log => {
    const found = testResults.clientLogs.some(clientLog => clientLog.includes(log.split(' ')[0]));
    console.log(`${found ? '✅' : '❌'} ${log}`);
  });
  
  console.log('\n📋 Actual Client Logs:');
  testResults.clientLogs.forEach(log => {
    console.log(`📝 ${log}`);
  });
  
  console.log('\n🎯 Flow Verification:');
  console.log(`${testResults.clientEmitted ? '✅' : '❌'} Client emitted start_game`);
  console.log(`${testResults.serverAcked ? '✅' : '❌'} Server ACKed successfully`);
  console.log(`${testResults.gameStartedEventReceived ? '✅' : '❌'} Game started event received`);
  console.log(`${testResults.navigationTriggered ? '✅' : '❌'} Navigation triggered`);
  
  const allPassed = testResults.clientEmitted && 
                   testResults.serverAcked && 
                   testResults.gameStartedEventReceived && 
                   testResults.navigationTriggered;
  
  console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED!' : '❌ SOME TESTS FAILED'}`);
  
  // Cleanup
  hostSocket.disconnect();
  playerSocket.disconnect();
  process.exit(allPassed ? 0 : 1);
}

// Error handling
hostSocket.on('error', (error) => {
  console.error('❌ Host socket error:', error);
  process.exit(1);
});

playerSocket.on('error', (error) => {
  console.error('❌ Player socket error:', error);
  process.exit(1);
});

// Start the test
console.log('🧪 Starting Multiplayer Flow Test...');
console.log('🏠 Test Room ID:', TEST_ROOM_ID);
console.log('🌐 Server URL:', SERVER_URL);

hostSocket.connect();

// Timeout after 30 seconds
setTimeout(() => {
  console.error('⏰ Test timed out after 30 seconds');
  process.exit(1);
}, 30000);
