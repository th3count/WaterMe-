"""
garden_manager.py

Garden Manager for WaterMe! — handles CRUD for library books, emitter info, plant instance simulation, plant instances, and zone management.
- Library book lookup, add/override/update/delete (0_custom.json only for writes)
- Emitter tolerance retrieval
- Simulation endpoint for optimizer review
- Zone CRUD for garden_data/zones.json
- Zone-aware plant instance management in garden_data/map.json

Author: Paidin Cash / th3count
Version: 0.5.0
Date: 2025-07-11
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Union, List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Body
from core.logger import log_event, safe_log
from core.optimizer import recommend_zone, recommend_emitter_size

router = APIRouter(prefix="/api/garden", tags=["garden"])

# Paths for library, map, and zones
LIBRARY_DIR = Path("library")
CUSTOM_BOOK = LIBRARY_DIR / "0_custom.json"
MAP_FILE = Path("garden_data/map.json")
ZONES_FILE = Path("garden_data/zones.json")

# --- Library book utilities ---

def load_library_books() -> Dict[str, List[Dict[str, Any]]]:
    books: Dict[str, List[Dict[str, Any]]] = {}
    for path in LIBRARY_DIR.glob("*.json"):
        try:
            books[path.stem] = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            log_event("library_load_failed", "garden_manager", "error", {"file": str(path), "error": str(e)})
    return books


def save_custom_book(plants: List[Dict[str, Any]]) -> None:
    CUSTOM_BOOK.write_text(json.dumps(plants, indent=2), encoding="utf-8")


def load_custom_book() -> List[Dict[str, Any]]:
    try:
        content = CUSTOM_BOOK.read_text(encoding="utf-8")
        if not content.strip(): return []
        return json.loads(content)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        log_event("custom_book_load_failed", "garden_manager", "error", {"file": str(CUSTOM_BOOK), "error": str(e)})
        return []

# --- Zone utilities ---

def load_zones() -> Dict[str, Dict[str, Any]]:
    try:
        content = ZONES_FILE.read_text(encoding="utf-8")
        if not content.strip(): return {}
        return json.loads(content)
    except Exception as e:
        log_event("zones_load_failed", "garden_manager", "error", {"file": str(ZONES_FILE), "error": str(e)})
        return {}


def save_zones(zones: Dict[str, Dict[str, Any]]) -> None:
    try:
        sorted_z = {z: zones[z] for z in sorted(zones, key=lambda x: int(x))}
    except Exception:
        sorted_z = dict(sorted(zones.items()))
    ZONES_FILE.write_text(json.dumps(sorted_z, indent=2), encoding="utf-8")

# --- Library HTTP endpoints ---

@router.get("/library/books", response_model=List[str])
def list_library_books():
    return list(load_library_books().keys())

@router.get("/library/plants", response_model=List[Dict[str, Any]])
def list_all_library_plants():
    summary: List[Dict[str, Any]] = []
    for book, entries in load_library_books().items():
        for plant in entries:
            summary.append({"book": book, "plant_id": plant.get("plant_id"), "common_name": plant.get("common_name")})
    return summary

@router.get("/library/plants/{book}/{plant_id}", response_model=Dict[str, Any])
def get_library_plant(book: str, plant_id: int):
    books = load_library_books()
    if book not in books:
        raise HTTPException(status_code=404, detail="Book not found")
    for p in books[book]:
        if p.get("plant_id") == plant_id:
            return p
    raise HTTPException(status_code=404, detail="Plant ID not found in book")

@router.post("/library/plants/add")
def add_custom_plant(plant: Dict[str, Any] = Body(...)):
    plants = load_custom_book()
    next_id = max((p.get("plant_id", 0) for p in plants), default=0) + 1
    plant.pop("plant_id", None)
    new = {"plant_id": next_id, **plant}
    plants.append(new)
    save_custom_book(plants)
    safe_log("[GardenManager] Added custom plant ID %s", next_id)
    return {"status": "ok", "message": f"Plant {next_id} added."}

# --- Zone management endpoints ---

@router.get("/zones", response_model=Dict[str, Dict[str, Any]])
def list_zones():
    return load_zones()

@router.post("/zones")
def add_zone(zone: Dict[str, Any] = Body(...)):
    freq = zone.get("frequency", "").upper()
    mode = zone.get("mode", "Smart")
    if mode == "Manual" and "start_time" in zone:
        if freq.startswith("D"):
            try:
                expected = int(freq[1:])
                if len(zone["start_time"]) != expected:
                    raise HTTPException(status_code=400, detail=f"Manual zone with frequency {freq} must have exactly {expected} start times")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid daily frequency format: {freq}")
        elif len(zone["start_time"]) != 1:
            raise HTTPException(status_code=400, detail=f"Manual zone with frequency {freq} must have exactly 1 start time")
    required = {"mode", "active", "frequency"}
    missing = required - zone.keys()
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing fields: {', '.join(missing)}")
    zones = load_zones()
    next_id = max((int(z) for z in zones.keys()), default=0) + 1
    zones[str(next_id)] = {
        "mode": zone["mode"],
        "active": zone["active"],
        "frequency": zone["frequency"],
        "date_activated": datetime.now().strftime("%Y-%m-%d@%H:%M")
    }
    for opt in ("start_time", "duration"):
        if opt in zone:
            zones[str(next_id)][opt] = zone[opt]
    save_zones(zones)
    safe_log("[GardenManager] Added zone ID %s", next_id)
    return {"status": "ok", "message": f"Zone {next_id} added."}

@router.put("/zones/{zone_id}")
def update_zone(zone_id: int, data: Dict[str, Any] = Body(...)):
    freq = data.get("frequency")
    mode = data.get("mode")
    if mode == "Manual" and "start_time" in data:
        if freq and freq.startswith("D"):
            try:
                expected = int(freq[1:])
                if len(data["start_time"]) != expected:
                    raise HTTPException(status_code=400, detail=f"Manual zone with frequency {freq} must have exactly {expected} start times")
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid daily frequency format: {freq}")
        elif len(data["start_time"]) != 1:
            raise HTTPException(status_code=400, detail=f"Manual zone with frequency {freq} must have exactly 1 start time")
    zones = load_zones()
    zstr = str(zone_id)
    if zstr not in zones:
        raise HTTPException(status_code=404, detail="Zone not found")
    for key in ("mode", "active", "frequency"):
        if key in data:
            zones[zstr][key] = data[key]
        if key == "active" and data[key] == True:
            zones[zstr]["date_activated"] = datetime.now().strftime("%Y-%m-%d@%H:%M")
        if key in ("start_time", "duration"):
            zones[zstr][key] = data[key]
            zones[zstr]["date_activated"] = datetime.now().strftime("%Y-%m-%d@%H:%M")
    save_zones(zones)
    safe_log("[GardenManager] Updated zone ID %s", zone_id)
    return {"status": "ok", "message": f"Zone {zone_id} updated."}

@router.delete("/zones/{zone_id}")
def delete_zone(zone_id: int):
    zones = load_zones()
    zstr = str(zone_id)
    if zstr not in zones:
        raise HTTPException(status_code=404, detail="Zone not found")
    del zones[zstr]
    save_zones(zones)
    safe_log("[GardenManager] Deleted zone ID %s", zone_id)
    return {"status": "ok", "message": f"Zone {zone_id} removed."}

# --- Emitter tolerance endpoint ---

def get_emitter_info(book: str, plant_id: int) -> Any:
    for p in load_library_books().get(book, []):
        if p.get("plant_id") == plant_id:
            return {"tolerance": {"tolerance_min_in_week": p.get("tolerance_min_in_week", 0), "water_optimal_in_week": p.get("water_optimal_in_week", 0), "tolerance_max_in_week": p.get("tolerance_max_in_week", 9999)}}
    return None

@router.get("/emitter/{book}/{plant_id}", response_model=Dict[str, Any])
def emitter_info(book: str, plant_id: int):
    info = get_emitter_info(book, plant_id)
    if not info:
        raise HTTPException(status_code=404, detail="Emitter info not found")
    return info

# --- Plant instance optimizer (batch support) ---

@router.post("/instance/optimizer", response_model=Union[dict, list])
def optimize_plant_instance(data: Union[dict, list] = Body(...)):
    entries = data if isinstance(data, list) else [data]
    results: List[Dict[str, Any]] = []
    for entry in entries:
        required = {"library_book", "plant_id", "quantity", "mode"}
        missing = required - entry.keys()
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing keys: {', '.join(missing)}")
        resp = dict(entry)
        if resp.get("mode") == "Manual":
            results.append(resp)
            continue
        books = load_library_books()
        book = resp["library_book"]
        pid = resp["plant_id"]
        if book not in books:
            raise HTTPException(status_code=404, detail="Book not found")
        matched = next((p for p in books[book] if p.get("plant_id") == pid), None)
        if not matched:
            raise HTTPException(status_code=404, detail="Plant ID not found in book")
        pref = matched.get("watering_frequency", [])
        if not isinstance(pref, list) or not pref:
            raise HTTPException(status_code=500, detail="Invalid watering_frequency format")
        preferred = pref[0]
        compatible = matched.get("compatible_watering_frequencies", [])
        resp["zone_id"] = recommend_zone(preferred, compatible)
        resp["emitter_size"] = recommend_emitter_size()
        results.append(resp)
    return results if isinstance(data, list) else results[0]

# --- Plant instance map endpoints ---

def load_plant_map() -> Dict[str, Any]:
    try:
        content = MAP_FILE.read_text(encoding="utf-8")
        if not content.strip(): return {}
        return json.loads(content)
    except Exception as e:
        log_event("map_load_failed", "garden_manager", "error", {"file": str(MAP_FILE), "error": str(e)})
        return {}

def save_plant_map(entries: Dict[str, Any]) -> None:
    try:
        sorted_m = {z: entries[z] for z in sorted(entries, key=lambda x: int(x))}
    except Exception:
        sorted_m = dict(sorted(entries.items()))
    MAP_FILE.write_text(json.dumps(sorted_m, indent=2), encoding="utf-8")

@router.post("/instance/add")
def add_plant_instance(instance: Union[Dict[str, Any], List[Dict[str, Any]]] = Body(...)):
    entries = instance if isinstance(instance, list) else [instance]
    zone_map = load_plant_map()
    flat = [e for zone in zone_map.values() for e in zone]
    next_id = max((e.get("instance_id", 0) for e in flat), default=0) + 1
    for entry in entries:
        required = {"library_book", "plant_id", "mode", "quantity", "comments", "time_to_maturity", "zone_id", "emitter_size"}
        missing = required - entry.keys()
        if entry.get("mode") == "Smart":
            for key in ("zone_id", "emitter_size"):
                if key not in entry:
                    missing.add(key)
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing keys: {', '.join(missing)}")
        if entry["mode"] not in ("Smart", "Manual"):
            raise HTTPException(status_code=400, detail="mode must be 'Smart' or 'Manual'")
        if not isinstance(entry["quantity"], int) or entry["quantity"] < 1:
            raise HTTPException(status_code=400, detail="quantity must be an integer >= 1")
        if not isinstance(entry["time_to_maturity"], int) or entry["time_to_maturity"] < 1:
            raise HTTPException(status_code=400, detail="time_to_maturity must be an integer (months) >= 1")
        entry["planted_date"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        record = {"instance_id": next_id, **{k: v for k, v in entry.items() if k != "instance_id"}}
        zone_key = str(record["zone_id"])
        zone_map.setdefault(zone_key, []).append(record)
        safe_log("[GardenManager] Added plant instance ID %s to zone %s", next_id, record["zone_id"])
        next_id += 1
    save_plant_map(zone_map)
    return {"status": "ok", "message": f"Added {len(entries)} instance(s)."}

@router.delete("/instances/{instance_id}")
def delete_plant_instance(instance_id: int):
    zone_map = load_plant_map()
    found = False
    for zone in list(zone_map):
        new_list = [p for p in zone_map[zone] if p.get("instance_id") != instance_id]
        if len(new_list) < len(zone_map[zone]):
            found = True
            if new_list:
                zone_map[zone] = new_list
            else:
                del zone_map[zone]
    if not found:
        raise HTTPException(status_code=404, detail="Plant instance not found")
    save_plant_map(zone_map)
    safe_log("[GardenManager] Deleted plant instance ID %s", instance_id)
    return {"status": "ok", "message": f"Instance {instance_id} removed."}

@router.delete("/instances")
def delete_multiple_plant_instances(instance_ids: List[int] = Body(...)):
    zone_map = load_plant_map()
    removed: List[int] = []
    not_found: List[int] = []
    for iid in instance_ids:
        found = False
        for zone in list(zone_map):
            new_list = [p for p in zone_map[zone] if p.get("instance_id") != iid]
            if len(new_list) < len(zone_map[zone]):
                found = True
                if new_list:
                    zone_map[zone] = new_list
                else:
                    del zone_map[zone]
                removed.append(iid)
                break
        if not found:
            not_found.append(iid)
    if removed:
        save_plant_map(zone_map)
    return {"status": "ok", "removed": removed, "not_found": not_found}
# --- End of garden_manager.py ---
