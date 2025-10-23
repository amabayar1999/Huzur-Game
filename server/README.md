# Huzur Multiplayer Server

Real-time multiplayer backend for the Huzur card game using Socket.io.

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   # or for development with auto-restart:
   npm run dev
   ```

3. **Server will run on:** `http://localhost:4000`

## 🧪 Testing

- **Health check:** `http://localhost:4000/health`
- **Expected response:** `{"status":"ok","rooms":0,"players":0}`

## 📡 Socket Events

### Client → Server
- `create_room` - Create a new game room
- `join_room` - Join an existing room
- `leave_room` - Leave current room
- `start_game` - Start the game in current room
- `play_card` - Play a card
- `get_rooms` - Get list of available rooms
- `get_room_state` - Get current room state

### Server → Client
- `room_created` - Room successfully created
- `room_joined` - Successfully joined a room
- `room_left` - Left a room
- `player_joined` - Another player joined
- `player_left` - Another player left
- `game_started` - Game has started
- `card_played` - A card was played
- `rooms_list` - List of available rooms
- `room_state` - Current room state
- `error` - Error message

## 🏗️ Architecture

- **Express.js** - HTTP server
- **Socket.io** - Real-time communication
- **RoomManager** - Manages game rooms and players
- **GameState** - Tracks game state per room

## 🔧 Configuration

- **Port:** 4000 (configurable via `PORT` environment variable)
- **CORS:** Allows connections from `localhost:3000` (Next.js dev server)
- **Max players per room:** 4
- **Auto-cleanup:** Empty rooms are automatically deleted

## 🎮 Game Flow

1. Player creates or joins a room
2. Players wait in lobby (2-4 players)
3. Game starts when ready
4. Real-time card playing and state sync
5. Game continues until completion

## 🚀 Next Steps

- Integrate with existing Huzur game logic
- Add game validation and rules
- Implement spectator mode
- Add player statistics and rankings
