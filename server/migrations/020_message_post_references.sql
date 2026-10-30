ALTER TABLE wm_messages ADD COLUMN post_id TEXT REFERENCES wm_posts(id);
