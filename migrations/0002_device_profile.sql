ALTER TABLE telemetry_batches
  ADD COLUMN device_profile_json TEXT
  CHECK (device_profile_json IS NULL OR json_valid(device_profile_json));
