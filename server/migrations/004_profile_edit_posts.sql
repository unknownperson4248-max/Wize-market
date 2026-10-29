ALTER TABLE wm_posts ADD COLUMN deleted_at INTEGER;
ALTER TABLE wm_posts ADD COLUMN updated_at INTEGER;
ALTER TABLE wm_posts ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS wm_profile_details(user_id TEXT PRIMARY KEY REFERENCES users(id),display_name TEXT,bio TEXT NOT NULL DEFAULT '',picture_id TEXT,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_media_checks(upload_id TEXT PRIMARY KEY REFERENCES wm_uploads(id),decision TEXT NOT NULL,reason TEXT NOT NULL,checked_at INTEGER NOT NULL);
CREATE VIEW IF NOT EXISTS wm_public_users AS SELECT u.id,COALESCE(NULLIF(d.display_name,''),u.name) name,CASE WHEN d.picture_id IS NOT NULL THEN '/avatar/'||u.id||'?v='||d.updated_at ELSE u.picture END picture,COALESCE(d.bio,'') bio,u.created_at,u.updated_at FROM users u LEFT JOIN wm_profile_details d ON d.user_id=u.id;
