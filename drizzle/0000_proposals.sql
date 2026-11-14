CREATE TABLE proposals (
  id TEXT PRIMARY KEY NOT NULL,
  client_hash TEXT NOT NULL UNIQUE,
  owner_hash TEXT NOT NULL UNIQUE,
  client_token TEXT NOT NULL,
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  created_at TEXT NOT NULL,
  chosen_option TEXT CHECK (chosen_option IS NULL OR chosen_option IN ('add', 'swap')),
  confirmed_at TEXT,
  CHECK ((chosen_option IS NULL AND confirmed_at IS NULL) OR (chosen_option IS NOT NULL AND confirmed_at IS NOT NULL))
);
