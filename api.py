from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
import sqlite3
from astral.sun import sun
from astral import LocationInfo
from datetime import datetime, timedelta
import re
import pytz

app = Flask(__name__)
CORS(app)

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "config", "settings.cfg")
GPIO_PATH = os.path.join(os.path.dirname(__file__), "config", "gpio.cfg")
SCHEDULE_JSON_PATH = os.path.join(os.path.dirname(__file__), "data", "schedule.json")
LOCATIONS_JSON_PATH = os.path.join(os.path.dirname(__file__), "data", "locations.json")

def parse_offset(code, base):
    m = re.search(r'([+-])(\d+)$', code)
    if m:
        sign = 1 if m.group(1) == '+' else -1
        minutes = int(m.group(2))
        return timedelta(minutes=sign * minutes)
    return timedelta()

@app.route('/api/garden', methods=['POST'])
def save_garden():
    data = request.json
    with open(SETTINGS_PATH, 'w') as f:
        json.dump(data, f, indent=2)
    return jsonify({'status': 'success'})

@app.route('/api/gpio', methods=['POST'])
def save_gpio():
    data = request.json
    with open(GPIO_PATH, 'w') as f:
        json.dump(data, f, indent=2)
    return jsonify({'status': 'success'})

@app.route('/config/gpio.cfg', methods=['GET'])
def get_gpio_cfg():
    return send_from_directory('config', 'gpio.cfg')

@app.route('/config/settings.cfg', methods=['GET'])
def get_settings_cfg():
    return send_from_directory('config', 'settings.cfg')

@app.route('/api/schedule', methods=['GET'])
def get_schedule():
    if not os.path.exists(SCHEDULE_JSON_PATH):
        return jsonify([])
    with open(SCHEDULE_JSON_PATH, 'r') as f:
        return jsonify(json.load(f))

@app.route('/api/schedule', methods=['POST'])
def save_schedule():
    data = request.json
    if not isinstance(data, list):
        return jsonify({'error': 'Invalid data'}), 400
    # Ensure each zone has a zone_id
    for idx, z in enumerate(data):
        if 'zone_id' not in z:
            z['zone_id'] = idx + 1  # (if you want 1-based IDs)
    with open(SCHEDULE_JSON_PATH, 'w') as f:
        json.dump(data, f, indent=2)
    return jsonify({'status': 'success'})

@app.route('/api/resolve_times', methods=['POST'])
def resolve_times():
    data = request.json
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid data'}), 400
    codes = data.get('codes', [])
    date = data.get('date')
    lat = data.get('lat')
    lon = data.get('lon')
    tz = data.get('timezone')  # Optionally allow override from frontend

    # If lat/lon or timezone not provided, try to load from settings.cfg
    if (lat is None or lon is None or not tz) and os.path.exists(SETTINGS_PATH):
        with open(SETTINGS_PATH, 'r') as f:
            settings = json.load(f)
            coords = settings.get('coords')
            if coords and len(coords) == 2:
                lon, lat = coords[0], coords[1]
            if not tz:
                tz = settings.get('timezone', 'UTC')

    if not (codes and date and lat is not None and lon is not None and tz):
        return jsonify({'error': 'Missing data'}), 400

    city = LocationInfo(latitude=lat, longitude=lon, timezone=tz)
    dt = datetime.fromisoformat(date)
    s = sun(city.observer, date=dt.date(), tzinfo=city.timezone)

    # Debug logging
    print(f"[resolve_times] lat={lat}, lon={lon}, tz={tz}, date={dt.date()}")
    print(f"[resolve_times] astral sun(): {s}")

    resolved = []
    for code in codes:
        base = None
        offset = timedelta()
        if code.startswith('SUNRISE'):
            base = s['sunrise']
            offset = parse_offset(code, 'SUNRISE')
        elif code.startswith('SUNSET'):
            base = s['sunset']
            offset = parse_offset(code, 'SUNSET')
        elif code.startswith('ZENITH'):
            base = s['noon']
            offset = parse_offset(code, 'ZENITH')
        elif code.isdigit() and len(code) == 4:
            h, m = int(code[:2]), int(code[2:])
            base = dt.replace(hour=h, minute=m, second=0, tzinfo=pytz.timezone(tz))
        if base:
            resolved_time = (base + offset).strftime('%H:%M')
            resolved.append(resolved_time)
        else:
            resolved.append('N/A')
    return jsonify(resolved)

@app.route('/api/locations', methods=['POST'])
def save_locations():
    data = request.json
    with open(LOCATIONS_JSON_PATH, 'w') as f:
        json.dump(data, f, indent=2)
    return jsonify({'status': 'success'})

@app.route('/api/locations', methods=['GET'])
def get_locations():
    if not os.path.exists(LOCATIONS_JSON_PATH):
        return jsonify([])
    with open(LOCATIONS_JSON_PATH, 'r') as f:
        return jsonify(json.load(f))

@app.route('/api/library-files', methods=['GET'])
def list_library_files():
    library_dir = os.path.join(os.path.dirname(__file__), 'library')
    files = [f for f in os.listdir(library_dir) if os.path.isfile(os.path.join(library_dir, f))]
    return jsonify(files)

@app.route('/library/<path:filename>')
def get_library_file(filename):
    return send_from_directory('library', filename)

@app.route('/api/map/save', methods=['POST'])
def save_map():
    map_path = os.path.join(os.path.dirname(__file__), "data", "map.json")
    data = request.json  # Should be the full map object
    with open(map_path, 'w') as f:
        json.dump(data, f, indent=2)
    return jsonify({"status": "success"})

@app.route('/api/map', methods=['GET'])
def get_map():
    map_path = os.path.join(os.path.dirname(__file__), "data", "map.json")
    if not os.path.exists(map_path):
        return jsonify({})
    with open(map_path, 'r') as f:
        return jsonify(json.load(f))

if __name__ == '__main__':
    app.run(debug=True) 