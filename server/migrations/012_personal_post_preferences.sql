CREATE TABLE wm_hidden_posts(user_id TEXT NOT NULL REFERENCES users(id),post_id TEXT NOT NULL REFERENCES wm_posts(id),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,post_id));
CREATE INDEX wm_hidden_post ON wm_hidden_posts(post_id);
