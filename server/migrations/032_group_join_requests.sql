-- Group join approval: the group admin can require approval before someone joins from the invite link.
-- Additive only: no group, member, message or post is deleted or rewritten. Existing groups stay open (join_approval = 0).
ALTER TABLE wm_groups ADD COLUMN join_approval INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS wm_group_join_requests(group_id TEXT NOT NULL REFERENCES wm_groups(id),user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(group_id,user_id));
CREATE INDEX IF NOT EXISTS wm_group_join_requests_group ON wm_group_join_requests(group_id,created_at);
