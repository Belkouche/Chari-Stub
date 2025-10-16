#!/bin/bash

# Aslan Full Environment Demo Script
# This script starts all components needed for development testing

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[DEMO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        return 1
    else
        return 0
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1

    print_status "Waiting for $service_name to be ready..."

    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            print_success "$service_name is ready!"
            return 0
        fi

        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done

    print_error "$service_name failed to start within expected time"
    return 1
}

# Function to cleanup on exit
cleanup() {
    print_status "Shutting down services..."

    # Kill background processes
    if [ ! -z "$CHARI_PID" ]; then
        kill $CHARI_PID 2>/dev/null || true
        print_status "Stopped Chari-stub (PID: $CHARI_PID)"
    fi

    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        print_status "Stopped Frontend (PID: $FRONTEND_PID)"
    fi

    if [ ! -z "$API_PID" ]; then
        kill $API_PID 2>/dev/null || true
        print_status "Stopped API (PID: $API_PID)"
    fi

    # Stop Docker containers
    if docker ps | grep -q aslan-postgres; then
        docker stop aslan-postgres >/dev/null 2>&1 || true
        print_status "Stopped PostgreSQL container"
    fi

    print_success "All services stopped"
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup INT TERM

echo "🚀 Starting Aslan Full Development Environment"
echo "=============================================="
echo ""

# Check required directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASLAN_DIR="$(dirname "$SCRIPT_DIR")"

print_status "Project directory: $ASLAN_DIR"

# Required project paths
CHARI_STUB_DIR="$ASLAN_DIR/Chari-stub"
FRONTEND_DIR="$ASLAN_DIR/aslan-app-standalone"
API_DIR="$ASLAN_DIR/aslan-api-standalone"

# Check if all required directories exist
if [ ! -d "$CHARI_STUB_DIR" ]; then
    print_error "Chari-stub directory not found at: $CHARI_STUB_DIR"
    exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
    print_error "Frontend directory not found at: $FRONTEND_DIR"
    print_warning "Please ensure aslan-app-standalone is in the same parent directory"
    exit 1
fi

if [ ! -d "$API_DIR" ]; then
    print_error "API directory not found at: $API_DIR"
    print_warning "Please ensure aslan-api-standalone is in the same parent directory"
    exit 1
fi

# Check if required ports are available
print_status "Checking port availability..."

if ! check_port 5432; then
    print_warning "Port 5432 (PostgreSQL) is already in use"
fi

if ! check_port 3000; then
    print_error "Port 3000 (Frontend) is already in use"
    exit 1
fi

if ! check_port 3001; then
    print_error "Port 3001 (API) is already in use"
    exit 1
fi

if ! check_port 4000; then
    print_error "Port 4000 (Chari-stub) is already in use"
    exit 1
fi

echo ""
print_status "🗄️  Starting PostgreSQL database..."

# Start PostgreSQL in Docker
if ! docker ps | grep -q aslan-postgres; then
    docker run -d \
        --name aslan-postgres \
        -e POSTGRES_DB=aslan_dev \
        -e POSTGRES_USER=aslan_user \
        -e POSTGRES_PASSWORD=aslan_password \
        -p 5432:5432 \
        postgres:15 >/dev/null

    # Wait for PostgreSQL to be ready
    wait_for_service "pg_isready -h localhost -p 5432" "PostgreSQL"
else
    print_success "PostgreSQL container already running"
fi

echo ""
print_status "🔗 Starting Chari API Stub (Port 4000)..."

# Start Chari-stub
cd "$CHARI_STUB_DIR"
npm run dev > /tmp/chari-stub.log 2>&1 &
CHARI_PID=$!

wait_for_service "http://localhost:4000/health" "Chari-stub"

echo ""
print_status "🔧 Starting Aslan API Backend (Port 3001)..."

# Start API backend
cd "$API_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing API dependencies..."
    npm install > /tmp/api-install.log 2>&1
fi

# Run database migrations and seed fake data
if [ -f "package.json" ] && grep -q "migrate" package.json; then
    print_status "Running database migrations..."
    npm run migrate > /tmp/api-migrate.log 2>&1 || true
fi

if [ -f "package.json" ] && grep -q "seed" package.json; then
    print_status "Injecting fake data..."
    npm run seed > /tmp/api-seed.log 2>&1 || true
fi

# Start the API server
npm run dev > /tmp/api.log 2>&1 &
API_PID=$!

wait_for_service "http://localhost:3001/health" "Aslan API"

echo ""
print_status "🎨 Starting Frontend Application (Port 3000)..."

# Start frontend
cd "$FRONTEND_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing frontend dependencies..."
    npm install > /tmp/frontend-install.log 2>&1
fi

# Start the frontend server
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

wait_for_service "http://localhost:3000" "Frontend Application"

echo ""
echo "🎉 All services are running!"
echo "=============================================="
echo ""
echo "📱 Frontend:        http://localhost:3000"
echo "🔧 API Backend:     http://localhost:3001"
echo "🔗 Chari Stub:      http://localhost:4000"
echo "🗄️  PostgreSQL:      localhost:5432 (aslan_dev/aslan_user)"
echo ""
echo "🔗 Architecture:"
echo "  Frontend (3000) ──→ API Backend (3001) ──→ Chari-stub (4000)"
echo "                                        └──→ PostgreSQL (5432)"
echo ""
echo "📋 Test Data:"
echo "  📞 Test customers in Chari-stub:"
echo "    +212600000001: Customer not found (status 0)"
echo "    +212600000002: Not confirmed (status 1)"
echo "    +212600000003: Confirmed but no PIN (status 2)"
echo "    +212600000004: Active customer (status 3)"
echo ""
echo "  🔑 API Key: aslan_internal_key_123"
echo "  🔒 Test PIN: 1234"
echo "  📱 Test OTP: 1234"
echo ""
echo "📊 Service Logs:"
echo "  Chari-stub: tail -f /tmp/chari-stub.log"
echo "  API:        tail -f /tmp/api.log"
echo "  Frontend:   tail -f /tmp/frontend.log"
echo ""
print_success "Environment ready! Press Ctrl+C to stop all services"

# Keep the script running and show live logs
print_status "Showing live logs (Ctrl+C to stop)..."
echo ""

# Show combined logs from all services
tail -f /tmp/chari-stub.log /tmp/api.log /tmp/frontend.log 2>/dev/null &

# Wait for interrupt
wait