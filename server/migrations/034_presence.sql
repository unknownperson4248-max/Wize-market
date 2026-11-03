-- Active status ("Active now", "Active 5m ago"): one row per member with the last time the site was open.
-- Additive only: one new table. Written at most once a minute per member.
CREATE TABLE IF NOT EXISTS wm_presence(user_id TEXT PRIMARY KEY REFERENCES users(id),seen_at INTEGER NOT NULL);
