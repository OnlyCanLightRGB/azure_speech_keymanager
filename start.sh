#!/bin/sh
set -e

echo "Starting Azure Speech Key Manager..."

# Function to handle shutdown
cleanup() {
    echo "Shutting down services..."
    if [ ! -z "$START_PID" ]; then
        kill $START_PID 2>/dev/null || true
    fi
    if [ ! -z "$DEV_PID" ]; then
        kill $DEV_PID 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Wait for database and redis to be ready
echo "Waiting for database and redis to be ready..."
sleep 10

# First run npm start to ensure compilation and proper initialization
echo "Running npm start for initialization..."
npm start &
START_PID=$!

# Wait for the start process to initialize properly
echo "Waiting for npm start to initialize..."
sleep 15

# Verify backend is responding
echo "Checking backend health..."
for i in {1..30}; do
    if wget --no-verbose --tries=1 --spider http://localhost:3019/api/health 2>/dev/null; then
        echo "Backend is ready!"
        break
    fi
    echo "Backend not ready yet, waiting... ($i/30)"
    sleep 2
done

# Now run npm run dev for development mode (which includes frontend)
echo "Starting development mode with frontend..."
npm run dev &
DEV_PID=$!

echo "Both services started. Start PID: $START_PID, Dev PID: $DEV_PID"

# Wait for both processes
wait $START_PID $DEV_PID
