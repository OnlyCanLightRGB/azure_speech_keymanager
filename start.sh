#!/bin/sh
set -e

echo "Starting Azure Speech Key Manager..."
echo "Environment variables:"
echo "  NODE_ENV: $NODE_ENV"
echo "  PORT: ${PORT:-3019}"
echo "  FRONTEND_PORT: ${FRONTEND_PORT:-3000}"
echo "  DB_HOST: $DB_HOST"
echo "  REDIS_URL: $REDIS_URL"

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

# Run database migrations
echo "Running database migrations..."
if [ -d "/app/database/migrations" ]; then
    # Create migrations table if it doesn't exist
    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl -e "
        CREATE TABLE IF NOT EXISTS migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );" 2>/dev/null || true

    # Run each migration file in order
    for migration_file in /app/database/migrations/*.sql; do
        if [ -f "$migration_file" ]; then
            filename=$(basename "$migration_file")
            # Check if migration has already been run
            already_run=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl -se "SELECT COUNT(*) FROM migrations WHERE filename='$filename'" 2>/dev/null || echo "0")

            if [ "$already_run" = "0" ]; then
                echo "Running migration: $filename"
                if mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl < "$migration_file" 2>&1 | {
                    while IFS= read -r line; do
                        # 过滤掉一些正常的警告信息
                        if echo "$line" | grep -v "Duplicate entry" | grep -v "already exists" | grep -v "Unknown column" >/dev/null; then
                            echo "  $line"
                        fi
                    done
                }; then
                    # Mark migration as completed
                    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl -e "INSERT IGNORE INTO migrations (filename) VALUES ('$filename')" 2>/dev/null || true
                    echo "  Migration $filename completed successfully"
                else
                    echo "  Warning: Migration $filename may have had issues, but continuing..."
                    # Still mark as completed to avoid re-running
                    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl -e "INSERT IGNORE INTO migrations (filename) VALUES ('$filename')" 2>/dev/null || true
                fi
            else
                echo "Migration $filename already applied, skipping"
            fi
        fi
    done
    echo "Database migrations completed"
else
    echo "Warning: Migrations directory not found"
fi

# Initialize Docker-specific data
echo "Initializing Docker environment data..."
if [ -f "/app/database/init-docker-data.sql" ]; then
    # Try to run the initialization script
    echo "Running Docker data initialization script..."
    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl < /app/database/init-docker-data.sql 2>&1 | {
        while IFS= read -r line; do
            # 过滤掉重复键错误，这些是正常的
            if echo "$line" | grep -v "Duplicate entry" | grep -v "already exists" >/dev/null; then
                echo "$line"
            fi
        done
    } || {
        echo "Note: Some Docker data initialization steps may have been skipped (data may already exist)"
    }
    echo "Docker data initialization completed"
else
    echo "Warning: Docker initialization script not found"
fi

# 确保必要的目录存在并有正确的权限
echo "Ensuring required directories exist..."
mkdir -p /app/json /app/uploads /app/credentials /app/logs /app/backups
chown -R nextjs:nodejs /app/json /app/uploads /app/credentials /app/logs /app/backups 2>/dev/null || true
chmod -R 755 /app/json /app/uploads /app/credentials 2>/dev/null || true

# Start backend server in production mode
echo "Starting backend server on port ${PORT:-3019}..."
NODE_ENV=production PORT=${PORT:-3019} node dist/server.js &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend server to be ready..."
sleep 15

# Check if backend is running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "Backend server failed to start"
    exit 1
fi

# Verify backend is responding
echo "Verifying backend health..."
for i in {1..10}; do
    if wget --no-verbose --tries=1 --spider "http://localhost:${PORT:-3019}/api/health" 2>/dev/null; then
        echo "Backend is healthy"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "Backend health check failed after 10 attempts"
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
    echo "Waiting for backend to be ready... (attempt $i/10)"
    sleep 3
done

# Start frontend server in production mode on port 3000
echo "Starting frontend server on port ${FRONTEND_PORT:-3000}..."
cd frontend && \
    PORT=${FRONTEND_PORT:-3000} \
    BACKEND_PORT=${PORT:-3019} \
    DOCKER_ENV=true \
    NODE_ENV=production \
    npm start &
FRONTEND_PID=$!

echo "Services started. Backend PID: $BACKEND_PID, Frontend PID: $FRONTEND_PID"

# Monitor both processes
while true; do
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "Backend process died, shutting down..."
        kill $FRONTEND_PID 2>/dev/null || true
        exit 1
    fi
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "Frontend process died, shutting down..."
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
    sleep 5
done
