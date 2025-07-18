"""
scheduler.py

WaterMe! Scheduler — computes watering durations and schedules with solar‑based logic.

Author: Paidin Cash / th3count
Refactor: OpenAI o3 (2025‑07‑15)
Version: 0.8.2
"""
from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime, date, timedelta
from typing import Dict, List, Tuple, Any, Optional
from zoneinfo import ZoneInfo

from astral import Observer
from astral.sun import sun
from configparser import ConfigParser

from core.logger import log_event

# ── Paths & config ────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).resolve().parent.parent  # <repo‑root>/backend
DATA_DIR      = BASE_DIR / "data"
GARDEN_DIR    = BASE_DIR / "garden_data"
LIBRARY_DIR   = BASE_DIR / "library"

GARDEN_ZONES  = GARDEN_DIR / "zones.json"
GARDEN_MAP    = GARDEN_DIR / "map.json"
SCHEDULE_FILE = DATA_DIR  / "schedule.json"

CFG           = ConfigParser()
settings_path = Path.home() / "settings.cfg"
try:
    CFG.read(settings_path)
except Exception:
    pass

# ── tolerant settings reader ─────────────────────────────────────────────────

def _loose_parse(path: Path) -> Dict[str, str]:
    result: Dict[str, str] = {}
    if not path.exists():
        return result
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            result[k.strip()] = v.strip()
    return result

LOOSE_CFG = _loose_parse(settings_path)

def _cfg(key: str, default: str | float) -> str | float:
    if CFG.has_option("Time & Location", key):
        return CFG.get("Time & Location", key, fallback=default)
    if key in LOOSE_CFG:
        return LOOSE_CFG[key]
    return default

TZ      = str(_cfg("timezone", "UTC"))
LAT     = float(_cfg("gps_lat", 0.0))
LON     = float(_cfg("gps_lon", 0.0))
TZINFO  = ZoneInfo(TZ)
OBSERVER = Observer(latitude=LAT, longitude=LON, elevation=0)

if LAT == 0.0 or LON == 0.0:
    log_event("settings_warning", "scheduler", "warning", {
        "msg": "GPS coordinates not found - using (0,0). Check settings.cfg",
        "path": str(settings_path),
        "lat": LAT,
        "lon": LON
    })

# ── I/O helpers ────────────────────────────────────────────────────────────────

def read_json(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        log_event("missing_file", "scheduler", "warning", {"file": str(path)})
        return {}
    except Exception as e:
        log_event("json_error", "scheduler", "error", {"file": str(path), "err": str(e)})
        return {}


def write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))

# ── Solar helpers ──────────────────────────────────────────────────────────────

def parse_offset(expr: str) -> Tuple[str, timedelta]:
    expr = expr.strip().upper()
    if "+" in expr:
        base, mins = expr.split("+", 1)
        return base.lower(), timedelta(minutes=int(mins))
    if "-" in expr:
        base, mins = expr.split("-", 1)
        return base.lower(), timedelta(minutes=-int(mins))
    return expr.lower(), timedelta()


def solar_times(day: date) -> Dict[str, datetime]:
    try:
        st = sun(observer=OBSERVER, date=day, tzinfo=TZINFO)
        return {"sunrise": st["sunrise"], "noon": st["noon"], "sunset": st["sunset"]}
    except Exception as e:
        log_event("solar_error", "scheduler", "error", {"date": str(day), "err": str(e)})
        now = datetime.now(TZINFO)
        return {"sunrise": now, "noon": now, "sunset": now}

# ── Duration helpers ───────────────────────────────────────────────────────────

def freq_to_events(code: str) -> float:
    c = code.upper()
    if c.startswith("D"): return int(c[1:]) * 28
    if c.startswith("W"): return int(c[1:]) * 4
    if c.startswith("M"): return int(c[1:])
    return 1.0


def instance_duration(inst: Dict[str, Any], events: float) -> Optional[float]:
    try:
        plants = read_json(LIBRARY_DIR / f"{inst['library_book']}.json")
        plant  = next(p for p in plants if p["plant_id"] == inst["plant_id"])
        weekly = plant["water_optimal_in_week"] * plant["root_area_sqft"] * 0.623
        return weekly / events / inst.get("emitter_size", 1.0) * 3600 * inst.get("quantity", 1)
    except Exception as e:
        log_event("duration_error", "scheduler", "error", {"inst": inst, "err": str(e)})
        return None


def zone_duration(zid: str, cfg: Dict[str, Any]) -> int:
    if cfg.get("mode") == "Manual":
        return cfg.get("duration", 1200)
    events = freq_to_events(cfg.get("frequency", "W1"))
    inst_list = read_json(GARDEN_MAP).get(str(zid), [])
    durs = [instance_duration(i, events) for i in inst_list]
    durs = [d for d in durs if d is not None]
    return int(sum(durs) / len(durs)) if durs else 1200

# ── Voting logic ───────────────────────────────────────────────────────────────

COOL_AM = 180

def band(offset_min: int, daylight_min: int) -> str:
    if offset_min <= COOL_AM: return "cool_am"
    if offset_min < daylight_min - COOL_AM: return "hot"
    if offset_min <= daylight_min + COOL_AM: return "cool_pm"
    return "cold"


def resolve_start(zid: str, sun_t: Dict[str, datetime]) -> datetime | None:
    inst_list = read_json(GARDEN_MAP).get(str(zid), [])
    if not inst_list:
        log_event("no_instances", "scheduler", "warning", {"zone": zid})
        return None
    daylight = int((sun_t["sunset"] - sun_t["sunrise"]).total_seconds() / 60)
    votes: Dict[str, float] = {b: 0.0 for b in ("cool_am","hot","cool_pm","cold")}
    stamps: List[Tuple[float, float, str]] = []
    for inst in inst_list:
        qty = inst.get("quantity", 1)
        wpref = qty * 1.0
        wcomp = qty * 0.75
        plant_data = read_json(LIBRARY_DIR / f"{inst['library_book']}.json")
        plant = next((p for p in plant_data if p["plant_id"] == inst["plant_id"]), None)
        if not plant:
            continue
        for cat, wt in (("preferred_time", wpref), ("compatible_watering_times", wcomp)):
            for expr in plant.get(cat, []):
                base, off = parse_offset(expr)
                ref = sun_t.get(base)
                if not ref:
                    continue
                ts = ref + off
                om = int((ts - sun_t["sunrise"]).total_seconds() / 60)
                if om < 0:
                    om += 1440
                bnd = band(om, daylight)
                votes[bnd] += wt
                stamps.append((ts.timestamp(), wt, bnd))
    if not stamps:
        return sun_t["sunrise"] + timedelta(minutes=30)
    dom = max(votes, key=votes.get)
    tot = sum(w for _, w, b in stamps if b == dom)
    ts_val = sum(s * w for s, w, b in stamps if b == dom) / tot
    return datetime.fromtimestamp(ts_val, tz=TZINFO)

# ── Main scheduler ─────────────────────────────────────────────────────────────

def generate(days: int = 30) -> List[Dict[str, Any]]:
    zones = read_json(GARDEN_ZONES)
    today = datetime.now(TZINFO).date()
    horizon = today + timedelta(days=days)
    schedule: List[Dict[str, Any]] = []
    for zid, cfg in zones.items():
        if not cfg.get("active"):
            continue
        dur = zone_duration(zid, cfg)
        freq = freq_to_events(cfg.get("frequency", "W1"))
        interval = timedelta(days=28 / freq if freq else 28)
        try:
            anchor = datetime.strptime(cfg.get("date_activated"), "%Y-%m-%d@%H:%M").replace(tzinfo=TZINFO)
        except Exception:
            anchor = datetime.now(TZINFO)
        while anchor.date() <= horizon:
            if anchor.date() >= today:
                sun_t = solar_times(anchor.date())
                start = resolve_start(zid, sun_t)
                if start:
                    schedule.append({
                        "zone_id": int(zid),
                        "start_time": start.strftime("%Y-%m-%dT%H:%M:%S"),
                        "duration": dur,
                        "mode": "Scheduled",
                    })
            anchor += interval
    uniq = {(e["zone_id"], e["start_time"]): e for e in schedule}
    return list(uniq.values())

# ── CLI entrypoint ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    events = generate()
    write_json(SCHEDULE_FILE, {"schedule": events})
    print(f"[scheduler] Schedule generated: {len(events)} events → {SCHEDULE_FILE}")
