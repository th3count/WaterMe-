#!/bin/bash
# Pi Auto-Commit Script for WaterMe! Live Sync
# This script monitors state files and auto-commits changes

cd /home/waterme/WaterMe/backend

# Check if we're on the live-sync branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "live-sync" ]; then
    echo "Switching to live-sync branch..."
    git checkout live-sync
fi

# Check for changes in state files (using relative paths from backend directory)
STATE_FILES=("data/active_zones.json" "data/schedule.json" "logs/*.log" "data/*.json")

HAS_CHANGES=false
for file in "${STATE_FILES[@]}"; do
    if git status --porcelain | grep -q "$file"; then
        HAS_CHANGES=true
        break
    fi
done

if [ "$HAS_CHANGES" = true ]; then
    echo "State changes detected, auto-committing..."
    
    # Add state files (only if they exist and have changes)
    if git status --porcelain | grep -q "data/active_zones.json"; then
        git add data/active_zones.json
    fi
    if git status --porcelain | grep -q "data/schedule.json"; then
        git add data/schedule.json
    fi
    if git status --porcelain | grep -q "logs/"; then
        git add logs/*.log
    fi
    
    # Commit with timestamp
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    git commit -m "Auto-sync: State update at $TIMESTAMP" --no-verify
    
    # Push to live-sync branch
    git push origin live-sync
    
    echo "Auto-commit completed at $TIMESTAMP"
else
    echo "No state changes detected"
fi 