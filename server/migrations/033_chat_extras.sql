-- Messenger-style chat extras: nicknames, chat colour and quick emoji, pinned messages.
-- Additive only: three new tables. No message, member, user or counter is changed.
CREATE TABLE IF NOT EXISTS wm_chat_nicknames(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),nickname TEXT NOT NULL,set_by TEXT NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL,PRIMARY KEY(kind,chat_id,user_id));
CREATE TABLE IF NOT EXISTS wm_chat_themes(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,color TEXT NOT NULL,emoji TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL,PRIMARY KEY(kind,chat_id));
CREATE TABLE IF NOT EXISTS wm_chat_pins(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,message_id INTEGER NOT NULL,pinned_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(kind,chat_id,message_id));
CREATE INDEX IF NOT EXISTS wm_chat_pins_chat ON wm_chat_pins(kind,chat_id,created_at);
