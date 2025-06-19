#!/bin/sh
set -e

echo "Starting Azure Speech Key Manager..."

# Function to handle shutdown
cleanup() {
    echo "Shutting down services..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Wait for database and redis to be ready
echo "Waiting for database and redis to be ready..."
sleep 10

# Start backend in background
echo "Starting backend server..."
node dist/server.js &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 5

# Start frontend
echo "Starting frontend server..."
cd frontend && PORT=3000 npm start &
FRONTEND_PID=$!

echo "Both services started. Backend PID: $BACKEND_PID, Frontend PID: $FRONTEND_PID"

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
