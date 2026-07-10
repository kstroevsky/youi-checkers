PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS telemetry_batches (
  batch_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  release TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  browser_family TEXT NOT NULL,
  os_family TEXT NOT NULL,
  device_class TEXT NOT NULL,
  viewport_class TEXT NOT NULL,
  network_class TEXT NOT NULL,
  pwa_mode TEXT NOT NULL,
  match_mode TEXT NOT NULL,
  ai_difficulty TEXT NOT NULL,
  browser_major INTEGER,
  os_major INTEGER,
  device_memory_gb REAL,
  hardware_concurrency INTEGER NOT NULL,
  screen_width INTEGER NOT NULL,
  screen_height INTEGER NOT NULL,
  viewport_width INTEGER NOT NULL,
  viewport_height INTEGER NOT NULL,
  device_pixel_ratio REAL NOT NULL,
  color_depth INTEGER NOT NULL,
  max_touch_points INTEGER NOT NULL,
  downlink_mbps REAL,
  rtt_ms REAL,
  save_data INTEGER NOT NULL,
  gpu_family TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json))
);

CREATE TABLE IF NOT EXISTS telemetry_incidents (
  incident_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'error')),
  occurred_at INTEGER NOT NULL,
  duration_ms REAL,
  expires_at INTEGER NOT NULL,
  context_json TEXT NOT NULL CHECK (json_valid(context_json)),
  FOREIGN KEY (batch_id) REFERENCES telemetry_batches(batch_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telemetry_batches_expiry
  ON telemetry_batches(expires_at);

CREATE INDEX IF NOT EXISTS idx_telemetry_batches_release_time
  ON telemetry_batches(release, received_at);

CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_kind_time
  ON telemetry_incidents(kind, occurred_at);

CREATE INDEX IF NOT EXISTS idx_telemetry_incidents_expiry
  ON telemetry_incidents(expires_at);
