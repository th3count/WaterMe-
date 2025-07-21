#!/bin/bash

echo "Starting WaterMe! Smart Garden System..."
echo

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed or not in PATH"
    echo "Please install Python 3.7+ and try again"
    exit 1
fi

# Make the script executable
chmod +x waterme.py

# Start the system
python3 waterme.py

# If we get here, the system has stopped
echo
echo "WaterMe! system has stopped." 