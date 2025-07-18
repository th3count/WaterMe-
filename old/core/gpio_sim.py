# gpio_sim.py

import json
import os
import curses

GPIO_STATE_FILE = "data/gpio_state.json"
zone_ids = range(1, 9)

def load_zone_states():
    if not os.path.exists(GPIO_STATE_FILE):
        with open(GPIO_STATE_FILE, "w") as f:
            json.dump({str(z): "off" for z in zone_ids}, f)
    with open(GPIO_STATE_FILE, "r") as f:
        return json.load(f)

def save_zone_states(states):
    with open(GPIO_STATE_FILE, "w") as f:
        json.dump(states, f, indent=2)

def get_zone_state(zone_id):
    states = load_zone_states()
    return states.get(str(zone_id), "off")

def activate_zone(zone_id):
    states = load_zone_states()
    states[str(zone_id)] = "on"
    save_zone_states(states)
    print(f"[GPIO SIM] Zone {zone_id} turned ON")

def deactivate_zone(zone_id):
    states = load_zone_states()
    states[str(zone_id)] = "off"
    save_zone_states(states)
    print(f"[GPIO SIM] Zone {zone_id} turned OFF")

def reset_all_zones():
    save_zone_states({str(z): "off" for z in zone_ids})
    print("[GPIO SIM] All zones reset to OFF")

def cli_ui():
    def toggle_zone(zone_id):
        if get_zone_state(zone_id) == "on":
            deactivate_zone(zone_id)
        else:
            activate_zone(zone_id)

    def draw_ui(stdscr):
        curses.curs_set(0)
        stdscr.nodelay(False)
        stdscr.timeout(1000)

        while True:
            stdscr.clear()
            stdscr.addstr(0, 2, "GPIO SIMULATOR STATUS", curses.A_BOLD | curses.A_UNDERLINE)
            stdscr.addstr(2, 2, " ZONE | STATUS ")
            stdscr.addstr(3, 2, "-------+--------")

            for i in zone_ids:
                status = get_zone_state(i).upper()
                stdscr.addstr(3 + i, 2, f"  {i:<4}|  {status:<5}")

            stdscr.addstr(13, 2, "-" * 30)
            stdscr.addstr(14, 2, "Command:")
            stdscr.addstr(15, 2, "Valid Inputs: 1-8 to toggle zones, Q to quit")
            stdscr.refresh()

            try:
                key = stdscr.getkey()
                if key.lower() == 'q':
                    break
                elif key in map(str, zone_ids):
                    toggle_zone(int(key))
            except:
                pass

    curses.wrapper(draw_ui)

if __name__ == "__main__":
    import sys

    if len(sys.argv) == 1:
        cli_ui()
    elif len(sys.argv) == 3:
        cmd = sys.argv[1].lower()
        try:
            zone_id = int(sys.argv[2])
            if zone_id not in zone_ids:
                raise ValueError()
        except ValueError:
            print("Usage: python gpio_sim.py [on|off|status] <zone_id>")
            sys.exit(1)

        if cmd == "on":
            activate_zone(zone_id)
            print(f"[Manual GPIO] Zone {zone_id} forced ON.")
        elif cmd == "off":
            deactivate_zone(zone_id)
            print(f"[Manual GPIO] Zone {zone_id} forced OFF.")
        elif cmd == "status":
            print(f"Zone {zone_id} is currently {get_zone_state(zone_id).upper()}.")
        else:
            print("Unknown command.")
