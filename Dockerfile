# Multi-stage build for production
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
# Set locale and encoding for proper UTF-8 support
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
WORKDIR /app

# Install root dependencies
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Install frontend dependencies
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
# Set locale and encoding for proper UTF-8 support
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
# Increase Node.js memory limit for build
ENV NODE_OPTIONS="--max-old-space-size=4096"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY . .

# Build backend
RUN npm run build:backend

# Build frontend with better error handling
RUN cd frontend && npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Configure Alpine mirrors for better connectivity and install dependencies
RUN echo "https://mirrors.aliyun.com/alpine/v3.21/main" > /etc/apk/repositories && \
    echo "https://mirrors.aliyun.com/alpine/v3.21/community" >> /etc/apk/repositories && \
    apk update && \
    apk add --no-cache wget python3 py3-requests

# Create a symbolic link for python3 to ensure it's in PATH
RUN ln -sf /usr/bin/python3 /usr/local/bin/python3

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install production dependencies only
COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm ci --only=production && npm cache clean --force
RUN cd frontend && npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/database ./database

# Copy Python scripts for Azure billing
COPY az.py /app/az.py

# Copy startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh && chown nextjs:nodejs /app/start.sh

# Create logs, backups, and uploads directories with proper permissions
RUN mkdir -p /app/logs /app/backups /app/uploads && chown -R nextjs:nodejs /app/logs /app/backups /app/uploads

USER nextjs

EXPOSE 3019
EXPOSE 3000

ENV PORT=3019

CMD ["/app/start.sh"]
