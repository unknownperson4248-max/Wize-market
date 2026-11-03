-- Message reactions and "delete for me". Additive only: two new tables; messages themselves are never changed here.
CREATE TABLE IF NOT EXISTS wm_message_reactions(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,message_id INTEGER NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),emoji TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(kind,chat_id,message_id,user_id));
CREATE INDEX IF NOT EXISTS wm_message_reactions_chat ON wm_message_reactions(kind,chat_id,message_id);
CREATE TABLE IF NOT EXISTS wm_message_hides(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,message_id INTEGER NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(kind,chat_id,user_id,message_id));
