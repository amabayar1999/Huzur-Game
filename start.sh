#!/bin/bash

# Huzur Multiplayer - Quick Start Script
echo "🎯 Starting Huzur Multiplayer Game..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install frontend dependencies"
    exit 1
fi

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd server
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install backend dependencies"
    exit 1
fi

cd ..

echo "✅ All dependencies installed successfully"

# Create logs directory
mkdir -p server/logs

echo "📁 Created logs directory"

# Start the server in background
echo "🚀 Starting server..."
cd server
npm start &
SERVER_PID=$!
cd ..

# Wait a moment for server to start
sleep 3

# Check if server is running
if curl -s http://localhost:4000/health > /dev/null; then
    echo "✅ Server is running on port 4000"
else
    echo "❌ Server failed to start"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# Start the frontend
echo "🌐 Starting frontend..."
npm run dev &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 5

echo ""
echo "🎉 Huzur Multiplayer is ready!"
echo ""
echo "📍 Access points:"
echo "   🎮 Main game: http://localhost:3000/multiplayer"
echo "   🃏 Single player: http://localhost:3000/card_game"
echo "   📊 Server health: http://localhost:4000/health"
echo "   📈 Server metrics: http://localhost:4000/metrics"
echo ""
echo "🛑 To stop the servers:"
echo "   Press Ctrl+C or run: kill $SERVER_PID $FRONTEND_PID"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $SERVER_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Servers stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for user to stop
echo "Press Ctrl+C to stop the servers..."
wait
