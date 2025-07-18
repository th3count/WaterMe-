"""
waterme.py

Main system loader and CLI relay for WaterMe!
Runs watchdog, zone_controller, and logger services.
Launches API backend via Uvicorn in background with CLI-safe logging.

Author: Paidin Cash / th3count
Version: 0.4.1
Date: 2025-07-10
"""

import subprocess
import threading
import time
import sys
import os

from core.logger import safe_log
from core import watchdog, zone_controller, logger, scheduler

api_process = None

# Service runners with CLI-safe logging
def run_watchdog():
    safe_log("[WaterMe] Starting Watchdog service")
    watchdog.main()

def run_zone_controller():
    safe_log("[WaterMe] Starting Zone Controller service")
    zone_controller.main()

def run_logger():
    safe_log("[WaterMe] Starting Logger service")
    logger.main()

def run_api():
    global api_process
    safe_log("[WaterMe] Launching API service on http://127.0.0.1:8000")
    api_process = subprocess.Popen([
        sys.executable, "-m", "uvicorn", "api.api_main:app",
        "--host", "127.0.0.1", "--port", "8000", "--reload"
    ])

# Graceful shutdown with logging
def shutdown():
    safe_log("[WaterMe] Shutting down services...")
    if api_process and api_process.poll() is None:
        api_process.terminate()
        api_process.wait()
        safe_log("[WaterMe] API service terminated")
    safe_log("[WaterMe] Shutdown complete.")

# Main entrypoint
# Run scheduler once on boot to generate runtime_state
scheduler.generate_schedule()

def main():
    safe_log("[WaterMe] Starting main controller")
    # Start background services
    threads = [
        threading.Thread(target=run_watchdog, daemon=True),
        threading.Thread(target=run_zone_controller, daemon=True),
        threading.Thread(target=run_logger, daemon=True)
    ]
    for t in threads:
        t.start()

    # Launch API
    run_api()

    # Nightly scheduler refresh thread
    def schedule_refresher():
        last_day = time.strftime("%Y-%m-%d")
        while True:
            now_day = time.strftime("%Y-%m-%d")
            if now_day != last_day:
                safe_log("[Scheduler] New day detected. Refreshing schedule.")
                scheduler.generate_schedule()
                last_day = now_day
            time.sleep(60)  # check once per minute

    threading.Thread(target=schedule_refresher, daemon=True).start()

    # Keep alive until interrupted
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        shutdown()

# Allow direct CLI execution
if __name__ == "__main__":
    main()
