"""
zone_controller.py

Zone Controller for WaterMe! — handles all timing, state management, and zone API control.
- Injects schedule-based and manual events into runtime_state.json
- Owns API endpoints for zone control (start/stop/force/view)
- Monitors schedule.json for daily and file-change refresh
- Supports schedule previewing for today and up to +60 days
- Does NOT enforce GPIO state — watchdog.py handles enforcement

Author: Paidin Cash / th3count
Version: 0.4.0
Date: 2025-07-14
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import json
import threading
import time
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.gpio_sim import activate_zone, deactivate_zone
from core.logger import log_event

STATE_FILE = Path("data/runtime_state.json")
SCHEDULE_FILE = Path("data/schedule.json")
router = APIRouter(prefix="/api/zone", tags=["zone"])

# Safe logging utility
def safe_log(message: str, level: str = "info") -> None:
    print(f"[ZONE] {level.upper()}: {message}")
    log_event(
        event_type="zone_log",
        source="zone_controller",
        severity=level,
        payload={"message": message}
    )

# Data model for manual zone runs
class ManualZoneRun(BaseModel):
    duration_sec: int
    start_time: datetime | None = Field(
        None,
        description="Optional ISO timestamp to start the run. If omitted or in the past, runs immediately."
    )

# Runtime state functions
def load_state() -> Dict[str, Any]:
    """Load current runtime zone state from disk; ensure dict format."""
    try:
        raw = STATE_FILE.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("runtime_state.json format invalid: expected JSON object")
        return data
    except FileNotFoundError:
        return {}
    except Exception as e:
        safe_log(f"Failed to load state: {e}", level="error")
        return {}

def save_state(state: Dict[str, Any]) -> None:
    """Persist runtime state to disk."""
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")

# Schedule monitoring globals and functions
timeschedule = {"mtime": None, "last_date": None}

def load_schedule() -> List[Dict[str, Any]]:
    """Load schedule definitions from disk."""
    try:
        data = json.loads(SCHEDULE_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("schedule"), list):
            return data["schedule"]
        return data if isinstance(data, list) else []
    except FileNotFoundError:
        return []
    except Exception as e:
        safe_log(f"Failed to load schedule: {e}", level="error")
        return []

# Daily schedule refresh
def refresh_daily_schedule() -> None:
    """Refresh runtime state with today's schedule, preserving manual runs."""
    schedule = load_schedule()
    state = load_state()
    manual_entries: Dict[str, List[Dict[str, Any]]] = {}
    for zid, events in state.items():
        ev_list = events if isinstance(events, list) else [events]
        for e in ev_list:
            if isinstance(e, dict) and e.get("manual"):
                manual_entries.setdefault(zid, []).append(e)
    new_state: Dict[str, List[Dict[str, Any]]] = {}
    for entry in schedule:
        if not isinstance(entry, dict):
            continue
        zid = str(entry.get("zone_id"))
        event = {
            "start_time": entry.get("start_time"),
            "duration": entry.get("duration"),
            "manual": False,
            "override": False,
            "paused": False
        }
        new_state.setdefault(zid, []).append(event)
    for zid, lst in manual_entries.items():
        new_state.setdefault(zid, []).extend(lst)
    save_state(new_state)
    safe_log(f"Refreshed daily schedule with {len(schedule)} entries", "info")

# Schedule monitoring worker
def schedule_worker() -> None:
    while True:
        try:
            today = datetime.now().date()
            if timeschedule["last_date"] != today:
                refresh_daily_schedule()
                timeschedule["last_date"] = today
            elif SCHEDULE_FILE.exists():
                mtime = SCHEDULE_FILE.stat().st_mtime
                if timeschedule["mtime"] != mtime:
                    refresh_daily_schedule()
                    timeschedule["mtime"] = mtime
        except Exception as e:
            safe_log(f"Schedule processing error: {e}", level="error")
        time.sleep(60)

def start_schedule_monitor():
    threading.Thread(target=schedule_worker, daemon=True).start()

# Zone control functions
def start_zone(zone_id: int, duration: int, manual: bool = False, prevent_overlap: bool = False) -> None:
    state = load_state()
    if prevent_overlap and str(zone_id) in state:
        raise ValueError(f"Zone {zone_id} already has a scheduled event")
    start_t = datetime.now().isoformat()
    event = {"start_time": start_t, "duration": duration, "manual": manual, "override": False, "paused": False}
    state.setdefault(str(zone_id), []).append(event)
    save_state(state)
    if manual:
        activate_zone(zone_id)
        safe_log(f"Activated zone {zone_id} immediately for {duration} seconds", "info")
    else:
        safe_log(f"Scheduled zone {zone_id} to run for {duration} seconds at {start_t}", "info")
    log_event(
        event_type="zone_start",
        source="zone_controller",
        severity="info",
        payload={"zone_id": zone_id, "duration": duration, "manual": manual, "start_time": start_t}
    )

def stop_zone(zone_id: int) -> None:
    state = load_state()
    if str(zone_id) in state:
        state.pop(str(zone_id))
        save_state(state)
        deactivate_zone(zone_id)
        safe_log(f"Stopped zone {zone_id}", "info")
        log_event(
            event_type="zone_stop",
            source="zone_controller",
            severity="info",
            payload={"zone_id": zone_id}
        )

def force_all_zones_off() -> None:
    state = load_state()
    for k in list(state.keys()):
        zid = int(k)
        deactivate_zone(zid)
        safe_log(f"Forcibly deactivated zone {zid}", "warning")
    state.clear()
    save_state(state)
    log_event(
        event_type="force_off_all",
        source="zone_controller",
        severity="warning",
        payload={"message": "All zones deactivated"}
    )

def get_zone_state(zone_id: int) -> Any:
    return load_state().get(str(zone_id))

def get_all_zones() -> Dict[str, Any]:
    return load_state()

def validate_state() -> None:
    s = load_state()
    for zid, data in s.items():
        if not all(k in data for k in ("start_time", "duration", "manual")):
            raise ValueError(f"Zone {zid} has invalid format: {data}")

# API endpoints
@router.post("/{zone_id}/run_manual")
def run_manual_zone(zone_id: int, request: ManualZoneRun):
    if not 1 <= zone_id <= 8:
        raise HTTPException(status_code=400, detail="Zone ID must be between 1 and 8")
    start_zone(zone_id, request.duration_sec, manual=True)
    return {"status": "ok", "message": f"Zone {zone_id} manually activated for {request.duration_sec} seconds"}

@router.post("/{zone_id}/stop")
def stop_zone_route(zone_id: int):
    if not 1 <= zone_id <= 8:
        raise HTTPException(status_code=400, detail="Zone ID must be between 1 and 8")
    stop_zone(zone_id)
    return {"status": "ok", "message": f"Zone {zone_id} manually stopped"}

@router.post("/force_off_all")
def force_off_all_route():
    force_all_zones_off()
    return {"status": "ok", "message": "All zones manually forced off"}

@router.get("/{zone_id}")
def get_zone_info(zone_id: int):
    data = get_zone_state(zone_id)
    if not data:
        raise HTTPException(status_code=404, detail="Zone not found")
    return data

@router.get("/")
def get_all_zone_info():
    return get_all_zones()

@router.get("/schedule/today")
def get_today_schedule():
    now = datetime.now()
    limit = now + timedelta(days=1)
    upcoming = [e for e in load_schedule() if now <= datetime.fromisoformat(e["start_time"]) < limit]
    return {"status": "ok", "count": len(upcoming), "entries": upcoming}

@router.get("/schedule/next/{days}")
def get_future_schedule(days: int):
    if not (1 <= days <= 60):
        raise HTTPException(status_code=400, detail="Range must be 1 to 60 days")
    now = datetime.now()
    limit = now + timedelta(days=days)
    upcoming = [e for e in load_schedule() if now <= datetime.fromisoformat(e["start_time"]) < limit]
    return {"status": "ok", "range_days": days, "count": len(upcoming), "entries": upcoming}

# CLI runner for standalone schedule monitoring
def main():
    safe_log("Zone controller schedule monitor running — press Ctrl+C to quit", level="info")
    start_schedule_monitor()
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        safe_log("Zone controller exiting on user interrupt.", level="info")

if __name__ == "__main__":
    main()
