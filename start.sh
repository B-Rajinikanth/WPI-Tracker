#!/bin/bash
# ── WPI Tracker MERN Stack – Start Both Servers ──────────
echo ""
echo "🚀  Starting WPI Tracker (MERN Stack)..."
echo ""

# Start Express API server (MongoDB Atlas backend)
echo "  [1/2] Starting API server on port 5001..."
cd "$(dirname "$0")/server" && node server.js &
API_PID=$!
sleep 2

# Start React / Vite frontend
echo "  [2/2] Starting React app on port 5173..."
cd "$(dirname "$0")/client" && npm run dev &
VITE_PID=$!
sleep 3

echo ""
echo "  ✅  API Server  →  http://localhost:5001"
echo "  ✅  React App   →  http://localhost:5173"
echo ""
echo "  Open http://localhost:5173 in your browser."
echo "  Press Ctrl+C to stop both servers."
echo ""

trap "kill $API_PID $VITE_PID 2>/dev/null; echo '  Stopped.'; exit 0" INT TERM
wait
