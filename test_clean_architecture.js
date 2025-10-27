// Test script for clean multiplayer architecture
const { io } = require('socket.io-client');

console.log('🧪 Testing Clean Multiplayer Architecture...\n');

// Test configuration
const SERVER_URL = 'http://localhost:4000';
const TEST_ROOM_ID = 'test-room-' + Math.random().toString(36).substr(2, 6);

// Create two test clients
const client1 = io(SERVER_URL);
const client2 = io(SERVER_URL);

let testResults = {
  connection: false,
  roomCreation: false,
  roomJoining: false,
  gameStart: false,
  cardPlay: false,
  stateSync: false
};

// Test 1: Connection
client1.on('connect', () => {
  console.log('✅ Client 1 connected:', client1.id);
  testResults.connection = true;
  
  // Test 2: Create room
  console.log('🏠 Creating room...');
  client1.emit('create_room', { roomId: TEST_ROOM_ID });
});

client2.on('connect', () => {
  console.log('✅ Client 2 connected:', client2.id);
  
  // Wait a bit then join room
  setTimeout(() => {
    console.log('🚪 Joining room...');
    client2.emit('join_room', { roomId: TEST_ROOM_ID });
  }, 1000);
});

// Test 3: Room creation
client1.on('room_created', (data) => {
  console.log('✅ Room created:', data.roomId);
  testResults.roomCreation = true;
  
  // Test 4: Start game
  setTimeout(() => {
    console.log('🎮 Starting game...');
    client1.emit('start_game');
  }, 2000);
});

// Test 4: Room joining
client2.on('room_joined', (data) => {
  console.log('✅ Client 2 joined room');
  testResults.roomJoining = true;
});

// Test 5: Game started
client1.on('game_started', (data) => {
  console.log('✅ Game started');
  console.log('📊 Game state:', {
    players: data.players?.length,
    gameStarted: data.gameStarted,
    deckCount: data.deckCount,
    trumpSuit: data.trumpSuit
  });
  testResults.gameStart = true;
  
  // Test 6: Play a card
  setTimeout(() => {
    console.log('🃏 Testing card play...');
    const playerHand = data.playerHands?.[client1.id];
    if (playerHand && playerHand.length > 0) {
      const card = playerHand[0];
      console.log('Playing card:', card);
      client1.emit('play_card', { card });
    }
  }, 1000);
});

// Test 6: State synchronization
client1.on('update_state', (data) => {
  console.log('✅ State updated');
  console.log('📊 Updated state:', {
    currentPlayer: data.currentPlayer,
    leadCard: data.leadCard,
    pile: data.pile?.length,
    deckCount: data.deckCount
  });
  testResults.stateSync = true;
  
  // Test 7: Pick up pile
  setTimeout(() => {
    console.log('📥 Testing pile pickup...');
    client1.emit('pickup_pile');
  }, 1000);
});

// Test 7: Card play validation
client1.on('error', (error) => {
  console.log('❌ Error:', error.message);
});

// Final test results
setTimeout(() => {
  console.log('\n🧪 Test Results:');
  console.log('================');
  console.log('Connection:', testResults.connection ? '✅' : '❌');
  console.log('Room Creation:', testResults.roomCreation ? '✅' : '❌');
  console.log('Room Joining:', testResults.roomJoining ? '✅' : '❌');
  console.log('Game Start:', testResults.gameStart ? '✅' : '❌');
  console.log('State Sync:', testResults.stateSync ? '✅' : '❌');
  
  const allPassed = Object.values(testResults).every(result => result);
  console.log('\nOverall Result:', allPassed ? '🎉 ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
  
  // Cleanup
  client1.close();
  client2.close();
  process.exit(allPassed ? 0 : 1);
}, 10000);

// Handle errors
client1.on('connect_error', (error) => {
  console.error('❌ Client 1 connection error:', error.message);
  process.exit(1);
});

client2.on('connect_error', (error) => {
  console.error('❌ Client 2 connection error:', error.message);
  process.exit(1);
});

console.log('⏳ Starting tests in 2 seconds...');
setTimeout(() => {
  console.log('🚀 Tests started!');
}, 2000);
