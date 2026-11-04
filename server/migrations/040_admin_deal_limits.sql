-- Deal limit per Admin: the most taka a trusted Admin can handle in one deal (set by the Owner). The Owner has no limit.
-- Additive only: one new table. No row means no limit.
CREATE TABLE IF NOT EXISTS wm_admin_deal_limits(user_id TEXT PRIMARY KEY REFERENCES users(id),max_amount INTEGER,updated_by TEXT NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL);
