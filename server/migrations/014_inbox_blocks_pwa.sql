-- Personal inbox controls never delete another member's history or deal records.
CREATE TABLE IF NOT EXISTS wm_user_blocks (
 user_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL, PRIMARY KEY(user_id,target_id), CHECK(user_id!=target_id)
);
CREATE INDEX IF NOT EXISTS wm_blocks_target ON wm_user_blocks(target_id);
CREATE TABLE IF NOT EXISTS wm_chat_preferences (
 user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('private','group')),
 chat_id TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)), muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1)),
 deleted_before INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,kind,chat_id)
);
CREATE TABLE IF NOT EXISTS wm_pwa_icons (
 upload_id TEXT PRIMARY KEY REFERENCES wm_uploads(id), created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);
