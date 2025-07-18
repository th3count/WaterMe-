"""
optimizer.py

Optimized zone recommendation logic for WaterMe! using event-per-week compatibility rules.
- Supports arbitrary "D#", "W#", "M#" codes
- Applies type-specific thresholds and special exceptions

Author: Paidin Cash / th3count
Version: 0.5.0
Date: 2025-07-11
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, FrozenSet

ZONES_FILE = Path("garden_data/zones.json")
# Special one-off compatibility pairs
SPECIAL_COMPAT: Set[FrozenSet[str]] = {
    frozenset({"W1", "M3"}),
    frozenset({"D1", "W5"}),
    frozenset({"D1", "W6"}),
}
# Compatibility thresholds per code prefix
THRESHOLDS: Dict[str, float] = {"D": 7.0, "W": 1.0, "M": 0.25}


def frequency_to_events_per_week(code: str) -> float:
    """Convert D#, W#, M# frequency codes to events per week."""
    code = code.upper()
    try:
        prefix, num = code[0], int(code[1:])
    except Exception:
        return -1.0
    if prefix == "D":  # times per day → week
        return num * 7.0
    if prefix == "W":  # times per week
        return float(num)
    if prefix == "M":  # times per month (~4 weeks)
        return num / 4.0
    return -1.0


def load_zones() -> Dict[str, Dict[str, Any]]:
    """Load zones configuration from JSON file."""
    try:
        return json.loads(ZONES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def is_special_compat(code1: str, code2: str) -> bool:
    """Check special one-off compatibility pairs."""
    return frozenset({code1, code2}) in SPECIAL_COMPAT


def recommend_zone(preferred: str, compatible: List[str]) -> int:
    """Recommend a zone ID based on watering frequency compatibility.
    Raises HTTPException 400 if no compatible zone is found.
    """
    from fastapi import HTTPException
    from core.logger import log_event

    plant_codes = [preferred.upper()] + [c.upper() for c in compatible]
    rates = {c: frequency_to_events_per_week(c) for c in plant_codes}

    zones = load_zones()
    best_zone: Optional[int] = None
    best_diff: float = float("inf")

    for zid, data in sorted(zones.items(), key=lambda x: int(x[0])):
        zone_code = data.get("frequency", "").upper()
        zone_rate = frequency_to_events_per_week(zone_code)
        if zone_rate < 0:
            continue

        for code, rate in rates.items():
            if is_special_compat(code, zone_code):
                log_event("zone_selected_special", "optimizer", "info", {
                    "zone": zid,
                    "zone_freq": zone_code,
                    "plant_code": code,
                    "matched_by": "special"
                })
                return int(zid)

            prefix = code[0]
            if zone_code[0] != prefix:
                continue

            diff = abs(zone_rate - rate)
            if diff <= THRESHOLDS[prefix] and diff < best_diff:
                best_diff = diff
                best_zone = int(zid)

    if best_zone is not None:
        log_event("zone_selected_range", "optimizer", "info", {
            "zone": best_zone,
            "matched_by": "range",
            "preferred": preferred,
            "compatible": compatible
        })
        return best_zone

    log_event("zone_selection_failed", "optimizer", "warning", {
        "preferred": preferred,
        "compatible": compatible,
        "reason": "no compatible zone found"
    })
    raise HTTPException(status_code=400, detail="No compatible zone found for watering frequency")


def recommend_emitter_size() -> float:
    """Return recommended emitter size (GPH) — placeholder until full logic added."""
    return 4.0
