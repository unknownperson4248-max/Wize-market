-- Smart feed: what people look at. Additive only: two new tables.
-- wm_post_signals: one row per person, post and kind ('dwell' = stayed on it in the feed, 'open' = opened details or photos, 'watch' = played the video).
-- wm_post_interest: running score per post (dwell 1, open 3, watch 3, like 2, comment 4) used to bring popular posts forward.
CREATE TABLE IF NOT EXISTS wm_post_signals(post_id TEXT NOT NULL REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(post_id,user_id,kind));
CREATE INDEX IF NOT EXISTS wm_post_signals_user ON wm_post_signals(user_id,created_at);
CREATE TABLE IF NOT EXISTS wm_post_interest(post_id TEXT PRIMARY KEY REFERENCES wm_posts(id),score INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);
