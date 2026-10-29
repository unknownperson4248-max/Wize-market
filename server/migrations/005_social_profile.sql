ALTER TABLE wm_profile_details ADD COLUMN cover_id TEXT;
CREATE TABLE IF NOT EXISTS wm_saved_posts(user_id TEXT NOT NULL REFERENCES users(id),post_id TEXT NOT NULL REFERENCES wm_posts(id),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,post_id));
CREATE TABLE IF NOT EXISTS wm_post_likes(user_id TEXT NOT NULL REFERENCES users(id),post_id TEXT NOT NULL REFERENCES wm_posts(id),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,post_id));
CREATE INDEX IF NOT EXISTS wm_likes_post ON wm_post_likes(post_id);
CREATE TABLE IF NOT EXISTS wm_post_comments(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created_at INTEGER NOT NULL,deleted_at INTEGER);
CREATE INDEX IF NOT EXISTS wm_comments_post ON wm_post_comments(post_id,created_at);
CREATE TABLE IF NOT EXISTS wm_deal_reviews(id TEXT PRIMARY KEY,deal_id TEXT NOT NULL REFERENCES wm_deals(id),reviewer_id TEXT NOT NULL REFERENCES users(id),target_id TEXT NOT NULL REFERENCES users(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comment TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(deal_id,reviewer_id));
DROP VIEW IF EXISTS wm_public_users;
CREATE VIEW wm_public_users AS SELECT u.id,COALESCE(NULLIF(d.display_name,''),u.name) name,CASE WHEN d.picture_id IS NOT NULL THEN '/avatar/'||u.id||'?v='||d.updated_at ELSE u.picture END picture,CASE WHEN d.cover_id IS NOT NULL THEN '/cover/'||u.id||'?v='||d.updated_at ELSE '/assets/profile-cover.webp' END cover,COALESCE(d.bio,'') bio,u.created_at,u.updated_at FROM users u LEFT JOIN wm_profile_details d ON d.user_id=u.id;
