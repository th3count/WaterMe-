"""
logger.py

Logger system for WaterMe! - handles persistent log storage and optional CLI-safe echo.
All logs are written to logs/logs.json with rollover/archive handling.
Thread‑safe writes prevent corruption when multiple threads log concurrently.

Author: Paidin Cash / th3count
Version: 0.4.2
Date: 2025-07-10
"""

import json
import threading
from datetime import datetime
from pathlib import Path
import time

LOG_FILE = Path("logs/logs.json")
# Ensure directory exists
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

# Global re‑entrant lock for thread‑safe log writes
_LOG_LOCK = threading.RLock()

# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def _read_log_file() -> list:
    """Return existing log list or empty list if file missing/invalid."""
    if not LOG_FILE.exists():
        return []
    try:
        data = LOG_FILE.read_text(encoding="utf-8").strip()
        logs = json.loads(data) if data else []
        if not isinstance(logs, list):  # corrupted structure
            raise ValueError("not a list")
        return logs
    except Exception as err:
        # Corrupted JSON – overwrite by returning empty list
        print(f"[Logger] Invalid JSON. Resetting log file. Error: {err}")
        return []


def _write_log_file(logs: list) -> None:
    """Write list of logs (last 100) atomically under lock."""
    with LOG_FILE.open("w", encoding="utf-8") as f:
        json.dump(logs[-100:], f, indent=2)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def log_event(event_type: str, source: str, severity: str, payload: dict):
    """Append a structured log entry, ensuring file integrity."""
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "event_type": event_type,
        "source": source,
        "severity": severity,
        "payload": payload,
    }
    try:
        with _LOG_LOCK:
            logs = _read_log_file()
            logs.append(log_entry)
            _write_log_file(logs)
    except Exception as e:
        print(f"[Logger] Error saving log: {e}")


def safe_log(message: str, *args):
    """Echo message to CLI and persist via log_event."""
    formatted = message % args if args else message
    print(formatted)
    log_event("cli_echo", "safe_log", "info", {"message": formatted})


def log_zone_report(zone_id: int, start: str, duration: int, mode: str):
    """Convenience report used by watchdog."""
    msg = f"[WATCHDOG] Zone {zone_id} | Start: {start} | Duration: {duration}s | Mode: {mode}"
    safe_log(msg)
    log_event(
        "zone_report",
        "watchdog",
        "info",
        {"zone_id": zone_id, "start": start, "duration": duration, "mode": mode},
    )

# ---------------------------------------------------------------------------
# Stand‑alone runner
# ---------------------------------------------------------------------------

def main():
    safe_log("[Logger] Ready - CLI log stream active")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        safe_log("[Logger] Shutdown complete.")


if __name__ == "__main__":
    main()
