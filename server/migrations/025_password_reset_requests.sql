-- Owner-assisted password reset: members send a request, the Owner sends a one-time link from their own WhatsApp / email.
-- New tables only. Reset tokens are stored as SHA-256 hashes and work once, for 24 hours.
CREATE TABLE IF NOT EXISTS wm_reset_requests(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),login TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('email','phone')),created_at INTEGER NOT NULL,handled_at INTEGER,handled_by TEXT REFERENCES users(id));
CREATE INDEX IF NOT EXISTS wm_reset_requests_open ON wm_reset_requests(handled_at,created_at);
CREATE TABLE IF NOT EXISTS wm_password_resets(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER);
