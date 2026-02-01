#!/bin/bash
# CleanAI Plus - Startup Script (Linux/Mac)

echo "=== CleanAI Plus Starting ==="
echo ""

# Backend check
if [ ! -d "./backend/venv" ]; then
    echo "[ERROR] Backend virtual environment not found!"
    echo "Please run: cd backend && python -m venv venv"
    exit 1
fi

# Frontend check
if [ ! -d "./frontend/node_modules" ]; then
    echo "[WARNING] Frontend dependencies not found. Installing..."
    cd frontend
    npm install
    cd ..
fi

# .env file check
if [ ! -f "./backend/.env" ]; then
    echo "[WARNING] .env file not found. Copying example..."
    cp ./backend/.env.example ./backend/.env
    echo "[OK] .env file created. Please check settings."
fi

echo "[START] Starting backend..."
cd backend
source venv/bin/activate
python main.py &
BACKEND_PID=$!
cd ..

sleep 2

echo "[START] Starting frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=== Application Started Successfully ==="
echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop the application"

# Trap SIGINT and cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

wait
