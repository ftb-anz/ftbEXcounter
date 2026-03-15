CREATE TABLE IF NOT EXISTS user_records (
    uuid TEXT PRIMARY KEY,
    records_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
);
