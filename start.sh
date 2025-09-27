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

# Start backend server in production mode
echo "Starting backend server..."
NODE_ENV=production node dist/server.js &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend server to be ready..."
sleep 15

# Check if backend is running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "Backend server failed to start"
    exit 1
fi

# Start frontend server in production mode on port 3000
echo "Starting frontend server..."
cd frontend && PORT=3000 npm start &
FRONTEND_PID=$!

echo "Services started. Backend PID: $BACKEND_PID, Frontend PID: $FRONTEND_PID"

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
