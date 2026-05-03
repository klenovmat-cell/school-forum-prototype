from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parent
database = root / "dev.db"
schema = root / "init.sql"

connection = sqlite3.connect(database)
try:
    connection.executescript(schema.read_text(encoding="utf-8"))
    connection.commit()
finally:
    connection.close()

print(f"SQLite database is ready at {database}")
