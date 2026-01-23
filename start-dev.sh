#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    
    # Kill all child processes
    pkill -P $$ 2>/dev/null
    
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}🚀 Starting SVRN Services (Development Mode)...${NC}\n"

# Function to run relayer with colored output
run_relayer() {
    cd "$SCRIPT_DIR/relayer"
    export NODE_OPTIONS="--dns-result-order=ipv4first"
    echo -e "${BLUE}[RELAYER]${NC} Starting..."
    npx ts-node index.ts 2>&1 | sed 's/^/[RELAYER] /'
}

# Function to build and run frontend with colored output
run_frontend() {
    cd "$SCRIPT_DIR/frontend"
    echo -e "${BLUE}[FRONTEND]${NC} Building..."
    yarn build 2>&1 | sed 's/^/[FRONTEND BUILD] /'
    if [ $? -ne 0 ]; then
        echo -e "${RED}[FRONTEND] Build failed!${NC}"
        return 1
    fi
    echo -e "${BLUE}[FRONTEND]${NC} Starting preview server..."
    yarn vite preview 2>&1 | sed 's/^/[FRONTEND] /'
}

# Start relayer in background
run_relayer &
RELAYER_PID=$!

# Wait a moment for relayer to start
sleep 2

# Check if relayer is still running
if ! kill -0 $RELAYER_PID 2>/dev/null; then
    echo -e "${RED}❌ Relayer failed to start${NC}"
    cleanup
    exit 1
fi

echo -e "${GREEN}✅ Relayer started (PID: $RELAYER_PID)${NC}\n"

# Start frontend in background
run_frontend &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 3

# Check if frontend is still running
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}❌ Frontend failed to start${NC}"
    cleanup
    exit 1
fi

echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}\n"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ All services running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Relayer:${NC}   http://localhost:3000"
echo -e "${BLUE}Frontend:${NC}  http://localhost:4173"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}\n"

# Wait for both processes
wait

