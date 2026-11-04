-- Notices for members: answers to their reports, verification results and ban appeals, with the Owner's note.
-- Additive only: one new table and two new nullable columns.
CREATE TABLE IF NOT EXISTS wm_notices(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'info',title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',link TEXT,created_at INTEGER NOT NULL,read_at INTEGER);
CREATE INDEX IF NOT EXISTS wm_notices_user ON wm_notices(user_id,created_at DESC);
ALTER TABLE wm_reports ADD COLUMN resolution_note TEXT;
ALTER TABLE wm_verification_requests ADD COLUMN review_note TEXT;
