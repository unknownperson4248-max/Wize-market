-- Existing members keep their current abilities. Only the owner edits these overrides.
CREATE TABLE IF NOT EXISTS wm_member_permissions (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 can_post INTEGER NOT NULL DEFAULT 1 CHECK(can_post IN (0,1)),
 can_message INTEGER NOT NULL DEFAULT 1 CHECK(can_message IN (0,1)),
 can_start_deal INTEGER NOT NULL DEFAULT 1 CHECK(can_start_deal IN (0,1)),
 updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at INTEGER NOT NULL
);
