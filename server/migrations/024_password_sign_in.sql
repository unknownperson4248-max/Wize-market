-- Email or phone number + password sign-in next to Google. Passwords are stored only as salted PBKDF2 hashes.
-- New table only; existing users and sessions are untouched.
CREATE TABLE IF NOT EXISTS wm_credentials(user_id TEXT PRIMARY KEY REFERENCES users(id),login TEXT NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('email','phone')),password_hash TEXT NOT NULL,salt TEXT NOT NULL,failed INTEGER NOT NULL DEFAULT 0,locked_until INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
