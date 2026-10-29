CREATE TABLE IF NOT EXISTS wm_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),username TEXT UNIQUE NOT NULL COLLATE NOCASE,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_suspensions(user_id TEXT PRIMARY KEY REFERENCES users(id),until_at INTEGER NOT NULL,reason TEXT NOT NULL,post_id TEXT,appealed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS wm_safety_events(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),decision TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_safety_post ON wm_safety_events(post_id,created_at);
CREATE TABLE IF NOT EXISTS wm_admin_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
