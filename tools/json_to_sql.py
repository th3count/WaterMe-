"""
json_to_sql.py

Developer tool to convert a JSON plant library (as in 5_fruitbushes.json) to a SQL file with schema and insert statements.
Usage:
    python tools/json_to_sql.py input.json output.sql table_name

- input.json: Path to the JSON file (e.g., /old/library/5_fruitbushes.json)
- output.sql: Path to the output SQL file (e.g., /library/fruitbushes.sql)
- table_name: Name of the SQL table to create (e.g., fruitbushes)
"""
import sys
import json

if len(sys.argv) != 4:
    print("Usage: python tools/json_to_sql.py input.json output.sql table_name")
    sys.exit(1)

input_json = sys.argv[1]
output_sql = sys.argv[2]
table_name = sys.argv[3]

with open(input_json, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Get all keys from the first entry
keys = data[0].keys()

# Map Python types to SQLite types
def infer_type(value):
    if isinstance(value, int):
        return 'INTEGER'
    elif isinstance(value, float):
        return 'REAL'
    elif isinstance(value, list):
        return 'TEXT'  # Store as JSON string
    else:
        return 'TEXT'

schema = f"CREATE TABLE {table_name} (\n"
for k in keys:
    v = data[0][k]
    col_type = infer_type(v)
    if k == 'plant_id':
        schema += f"    {k} INTEGER PRIMARY KEY,\n"
    else:
        schema += f"    {k} {col_type},\n"
schema = schema.rstrip(',\n') + '\n);\n\n'

# Write schema and inserts to output file
with open(output_sql, 'w', encoding='utf-8') as f:
    f.write(schema)
    for entry in data:
        columns = ', '.join(entry.keys())
        values = []
        for k in entry.keys():
            v = entry[k]
            if isinstance(v, list):
                v = json.dumps(v, ensure_ascii=False)
            if isinstance(v, str):
                v = v.replace("'", "''")  # Escape single quotes
                values.append(f"'{v}'")
            elif v is None:
                values.append('NULL')
            else:
                values.append(str(v))
        values_str = ', '.join(values)
        f.write(f"INSERT INTO {table_name} ({columns}) VALUES ({values_str});\n")

print(f"SQL file written to {output_sql}") 