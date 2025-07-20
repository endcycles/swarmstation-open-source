#!/bin/bash

# Emergency cleanup script to kill all SwarmStation processes

echo "🛑 Killing all SwarmStation processes..."

# Kill all SwarmStation processes
pkill -f SwarmStation

# Double check with killall
killall SwarmStation 2>/dev/null

# If processes still exist, force kill
pgrep -f SwarmStation | while read pid; do
    echo "Force killing PID: $pid"
    kill -9 $pid 2>/dev/null
done

# Also kill any orphaned node processes that might be related
pkill -f "node.*claude"
pkill -f "claude.*code"

echo "✅ All SwarmStation processes killed"
echo ""
echo "Current remaining processes:"
ps aux | grep -i swarmstation | grep -v grep

echo ""
echo "⚠️  To prevent this in the future, always use:"
echo "   - Cmd+Q to quit the app properly"
echo "   - Stop all agents before closing"