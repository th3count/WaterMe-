# health_check.py

import json
from datetime import datetime
from pathlib import Path

PLANTS_FILE = Path("garden_data/plants.json")
LIBRARY_PATH = Path("library")
SCHEDULE_FILE = Path("schedule/schedule.json")
LOG_PATH = Path("logs/HEALTHCHECK-{date}.log".format(date=datetime.now().date()))

DEFAULT_TOLERANCE = 0.30

def load_json(path):
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)

def log_issue(issue):
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(issue) + "\n")

def get_plant_library():
    plants = {}
    for file in LIBRARY_PATH.glob("*.json"):
        data = load_json(file)
        for entry in data.get("plants", []):
            plants[(file.name, entry["id"])] = entry
    return plants

def calculate_water_delivered(emitter_size, frequency, duration_minutes):
    gph = emitter_size
    gpm = gph / 60
    return round(gpm * duration_minutes * frequency, 2)

def check_emitter_sizing():
    issues = []
    plants = load_json(PLANTS_FILE).get("plants", [])
    library = get_plant_library()

    for plant in plants:
        key = (plant["library_name"], plant["plant_id"])
        definition = library.get(key)
        if not definition:
            continue

        required = definition["water_requirement_gal"]
        emitter = plant["emitter_size"]
        duration = plant.get("duration_override", 20)  # default duration if none provided
        frequency = 1  # assume daily for now, update if logic evolves

        delivered = calculate_water_delivered(emitter, frequency, duration)

        # Determine acceptable range
        tolerance_min = definition.get("tolerance_min", 1 - DEFAULT_TOLERANCE)
        tolerance_max = definition.get("tolerance_max", 1 + DEFAULT_TOLERANCE)
        min_ok = required * tolerance_min
        max_ok = required * tolerance_max

        if delivered < min_ok:
            issue = {
                "plant_id": plant["plant_id"],
                "plant_name": plant["plant_name"],
                "location_id": plant["location_id"],
                "delivered": delivered,
                "required": required,
                "issue": "Emitter too small"
            }
            issues.append(issue)
            log_issue(issue)

        elif delivered > max_ok:
            issue = {
                "plant_id": plant["plant_id"],
                "plant_name": plant["plant_name"],
                "location_id": plant["location_id"],
                "delivered": delivered,
                "required": required,
                "issue": "Emitter too large"
            }
            issues.append(issue)
            log_issue(issue)

    return issues

def check_schedule_exists():
    data = load_json(SCHEDULE_FILE)
    return bool(data)

def run_health_check():
    results = {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "issues": []
    }

    if not check_schedule_exists():
        results["status"] = "warnings"
        results["issues"].append({
            "type": "schedule",
            "message": "No valid schedule found"
        })
        log_issue({"type": "schedule", "message": "No valid schedule found"})

    emitter_issues = check_emitter_sizing()
    if emitter_issues:
        results["status"] = "warnings"
        results["issues"].extend(emitter_issues)

    return results

if __name__ == "__main__":
    print(json.dumps(run_health_check(), indent=2))
