"""
watchdog.py

Core GPIO enforcement and scheduled watering event processor for WaterMe!.
- Enforces zone relay ON/OFF state via GPIO or simulator.
- Monitors and validates `runtime_state.json` (multi-event, per-zone format, pydantic-checked).
- Sends all log output and zone reports to the API logger (and always prints to CLI).
- Shuts down cleanly and ensures all zones are OFF on exit.
- Provides HTTP API for zone monitoring and bulk control.

Author: Paidin Cash / th3count
Version: 0.3.x
Date: 2025-07-09
"""

import time
import json
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel, ValidationError
from fastapi import APIRouter

from core.gpio_sim import activate_zone, deactivate_zone
from core.logger import log_event, log_zone_report
from core.zone_controller import load_state, save_state  # ✅ PATCHED

STATE_FILE = Path("data/runtime_state.json")
GPIO_STATE_FILE = Path("data/gpio_state.json")
CHECK_INTERVAL = 5  # seconds between checks
OVERRIDE_COOLDOWN = CHECK_INTERVAL * 2

# In-memory maps
active_map: dict[int, bool] = {}
last_override: dict[int, float] = {}

# API Router
router = APIRouter(prefix="/api/watchdog", tags=["watchdog"])


def read_gpio_state(zone_id: int) -> str:
    try:
        return json.loads(GPIO_STATE_FILE.read_text()).get(str(zone_id), "off")
    except Exception as e:
        safe_log(f"GPIO read error for zone {zone_id}: {e}", level="error")
        return "off"


def safe_log(message: str, level: str = "info") -> None:
    print(f"[WATCHDOG] {level.upper()}: {message}")
    log_event("watchdog_log", "watchdog", level, {"message": message})


def get_active_zones(state: dict) -> dict[int, float]:
    class RuntimeEvent(BaseModel):
        start_time: datetime
        duration: int
        manual: bool = False

    now_ts = datetime.now().timestamp()
    active: dict[int, float] = {}
    for zid, events in state.items():
        zid_int = int(zid)
        if not isinstance(events, list):
            events = [events]
        for event in events:
            try:
                validated = RuntimeEvent(**event)
                start_ts = validated.start_time.timestamp()
                elapsed = now_ts - start_ts
                if 0 <= elapsed < validated.duration:
                    active[zid_int] = validated.duration - elapsed
            except ValidationError as ve:
                safe_log(f"Invalid event for zone {zid}: {ve}", level="error")
    return active


def log_zone_report_event(zone_id: int, start_ts: float, duration: int, manual: bool = False):
    report = {
        "zone_id": zone_id,
        "zone_start": datetime.fromtimestamp(start_ts).isoformat(),
        "zone_stop": datetime.fromtimestamp(start_ts + duration).isoformat(),
        "zone_duration": duration,
        "event_type": "manual" if manual else "scheduled"
    }
    safe_log(f"Zone {zone_id} report → Start: {report['zone_start']}, Stop: {report['zone_stop']}, Duration: {duration}s, Mode: {report['event_type']}", level="info")
    try:
        log_zone_report(report)
    except Exception as e:
        print(f"[WATCHDOG] Failed to send report log for zone {zone_id}: {e}")


def main() -> None:
    global active_map, last_override
    safe_log("Starting monitoring loop.", level="info")

    while True:
        now_ts = datetime.now().timestamp()
        state = load_state()
        if not hasattr(main, "_last_state") or main._last_state != state:
            main._last_state = state
            safe_log(f"runtime_state.json loaded with {len(state)} zones:", level="info")
            for zid, events in state.items():
                if not isinstance(events, list):
                    events = [events]
                for e in events:
                    start = e.get("start_time", "unknown")
                    duration = e.get("duration", "unknown")
                    mode = "Manual" if e.get("manual") else "Scheduled"
                    safe_log(f"Zone {zid} | Start: {start} | Duration: {duration}s | Mode: {mode}", level="info")

        active_zones = get_active_zones(state)

        for zid in list(active_map.keys()):
            zid_str = str(zid)
            if zid not in active_zones:
                if read_gpio_state(zid) == "on":
                    deactivate_zone(zid)
                if zid_str in state:
                    events = state[zid_str]
                    if not isinstance(events, list):
                        events = [events]
                    for e in events:
                        start_ts = datetime.fromisoformat(e["start_time"]).timestamp()
                        elapsed = now_ts - start_ts
                        if 0 <= elapsed <= e["duration"]:
                            log_zone_report_event(zid, start_ts, e["duration"], manual=e.get("manual", False))
                    state[zid_str] = [e for e in events if now_ts < datetime.fromisoformat(e["start_time"]).timestamp() + e["duration"]]
                    if not state[zid_str]:
                        state.pop(zid_str)
                    save_state(state)
                active_map.pop(zid, None)

        for zone_id in range(1, 9):
            zid_str = str(zone_id)
            expected = zone_id in active_zones
            actual_on = (read_gpio_state(zone_id) == "on")
            events = state.get(zid_str, [])
            if not isinstance(events, list):
                events = [events]

            if expected:
                if not actual_on:
                    if zone_id in active_map:
                        activate_zone(zone_id)
                        safe_log(f"GPIO fault: Zone {zone_id} off during active window. Reactivated.", level="error")
                    else:
                        mode = "Scheduled"
                        for e in events:
                            if now_ts >= datetime.fromisoformat(e["start_time"]).timestamp():
                                mode = "Manual" if e.get("manual") else "Scheduled"
                                break
                        activate_zone(zone_id)
                        safe_log(f"{mode} start: Zone {zone_id} activated.", level="info")
                    active_map[zone_id] = True
                continue

            if actual_on:
                last_ts = last_override.get(zone_id, 0)
                if now_ts - last_ts >= OVERRIDE_COOLDOWN:
                    deactivate_zone(zone_id)
                    safe_log(f"Override: Zone {zone_id} forced off (unscheduled on).", level="warning")
                    last_override[zone_id] = now_ts

        active_map = {z: True for z in active_zones}
        time.sleep(CHECK_INTERVAL)


@router.get("/status")
def get_watchdog_status():
    runtime_state = load_state()
    try:
        gpio_state = json.loads(GPIO_STATE_FILE.read_text())
    except:
        gpio_state = {}

    now = datetime.now().timestamp()
    zones = []
    for zone_id in range(1, 9):
        runtime = runtime_state.get(str(zone_id))
        gpio = gpio_state.get(str(zone_id), "off")

        if runtime:
            start = datetime.fromisoformat(runtime["start_time"]).timestamp()
            duration = runtime["duration"]
            remaining = max(0, int(start + duration - now))
            active = remaining > 0
        else:
            active = False
            remaining = 0

        zones.append({
            "zone_id": zone_id,
            "active": active,
            "gpio": gpio,
            "duration": runtime["duration"] if runtime else 0,
            "start_time": runtime["start_time"] if runtime else None,
            "end_time": runtime["end_time"] if runtime and "end_time" in runtime else None,
            "remaining_sec": remaining,
            "manual": runtime.get("manual") if runtime else False,
            "override": runtime.get("override") if runtime else False
        })

    return {"status": "ok", "zones": zones, "timestamp": datetime.now().isoformat()}


@router.post("/force_off_all")
def force_off_all_zones():
    state = load_state()
    for zone_id in range(1, 9):
        deactivate_zone(zone_id)
        state.pop(str(zone_id), None)
    save_state(state)
    safe_log("All zones forcibly deactivated via API.", level="warning")
    return {"status": "ok", "message": "All zones deactivated"}


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        safe_log("Watchdog shutdown requested via KeyboardInterrupt.", level="warning")
        for zone_id in range(1, 9):
            deactivate_zone(zone_id)
            state = read_gpio_state(zone_id)
            safe_log(f"Zone {zone_id} is {state.upper()}.", level="info")
        safe_log("Watchdog shutdown complete.", level="info")
