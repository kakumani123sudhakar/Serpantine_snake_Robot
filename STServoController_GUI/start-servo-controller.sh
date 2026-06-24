#!/bin/bash

# STServo Controller - Production Startup Script (Linux/macOS Version)
echo "STServo Controller - Production Startup Script"
echo "================================================"
echo ""

# Check if Python is available
echo "Checking Python..."
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
    echo "OK: Python3 found"
    python3 --version
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
    echo "OK: Python found"
    python --version
else
    echo "ERROR: Python not found! Please install Python 3.8+"
    read -p "Press Enter to exit"
    exit 1
fi

# Check if Node.js is available
echo ""
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    echo "OK: Node.js found"
    node --version
else
    echo "ERROR: Node.js not found! Please install Node.js 14+"
    read -p "Press Enter to exit"
    exit 1
fi

# Check if required files exist
echo ""
echo "Checking project files..."
if [ ! -f "requirements.txt" ]; then
    echo "ERROR: requirements.txt not found!"
    read -p "Press Enter to exit"
    exit 1
fi
if [ ! -f "backend/app.py" ]; then
    echo "ERROR: backend/app.py not found!"
    read -p "Press Enter to exit"
    exit 1
fi
if [ ! -d "frontend-build" ]; then
    echo "ERROR: frontend-build directory not found!"
    read -p "Press Enter to exit"
    exit 1
fi
echo "OK: All project files found"

# Setup virtual environment
echo ""
echo "Setting up virtual environment..."
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to create virtual environment!"
        read -p "Press Enter to exit"
        exit 1
    fi
    echo "OK: Virtual environment created"
else
    echo "OK: Virtual environment exists"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to activate virtual environment!"
    read -p "Press Enter to exit"
    exit 1
fi
echo "OK: Virtual environment activated"

# Check and install dependencies only if needed
echo ""
echo "Checking dependencies..."

# Check if Flask is already installed
if $PYTHON_CMD -c "import flask; print('installed')" 2>/dev/null; then
    echo "OK: Python dependencies already installed"
else
    echo "Installing Python dependencies..."
    pip install -r requirements.txt --quiet
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies!"
        read -p "Press Enter to exit"
        exit 1
    fi
    echo "OK: Python dependencies installed"
fi

# Check serve package
echo "Checking serve package..."
if npx serve --version &>/dev/null; then
    echo "OK: Serve package already available"
else
    echo "Installing serve package..."
    npm install -g serve --quiet
    if [ $? -ne 0 ]; then
        echo "WARNING: Failed to install serve globally, will use npx..."
    else
        echo "OK: Serve package installed"
    fi
fi

echo ""
echo "[1/2] Starting Backend Server..."
echo "Starting Flask backend on http://localhost:5000"

# Start backend in background (run from backend directory to fix import path)
cd backend && $PYTHON_CMD app.py &
BACKEND_PID=$!

echo "Backend started with PID: $BACKEND_PID"
echo "Waiting for backend to initialize..."
sleep 5

echo "[2/2] Starting Frontend Server..."
echo "Starting React frontend on http://localhost:3000"

# Start frontend in background
npx serve frontend-build -l 3000 --single &
FRONTEND_PID=$!

echo "Frontend started with PID: $FRONTEND_PID"

echo ""
echo "========================================"
echo "   Servers Started Successfully!"
echo "========================================"
echo ""
echo "Backend API:  http://localhost:5000"
echo "Frontend UI: http://localhost:3000"
echo ""
echo "Both servers are now running in the background."
echo "To stop the servers, run: pkill -f 'python.*app.py' && pkill -f 'npx serve.*frontend-build'"
echo ""

# Try to open browser (platform dependent)
if command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open http://localhost:3000 &
elif command -v open &> /dev/null; then
    # macOS
    open http://localhost:3000 &
fi

echo "Press Ctrl+C to stop all servers..."
echo ""

# Wait for user to stop
trap 'echo ""; echo "Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; pkill -f "python.*app.py" 2>/dev/null; pkill -f "npx serve.*frontend-build" 2>/dev/null; echo "Servers stopped."; exit 0' INT
wait
