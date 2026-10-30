ALTER TABLE wm_messages ADD COLUMN deleted_at INTEGER;
ALTER TABLE wm_messages ADD COLUMN archived_at INTEGER;
ALTER TABLE wm_group_messages ADD COLUMN deleted_at INTEGER;
ALTER TABLE wm_group_messages ADD COLUMN archived_at INTEGER;
CREATE TABLE IF NOT EXISTS wm_friend_requests(pair_key TEXT PRIMARY KEY,from_id TEXT NOT NULL REFERENCES users(id),to_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled')),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,CHECK(from_id!=to_id));
CREATE INDEX IF NOT EXISTS wm_friend_recipient ON wm_friend_requests(to_id,status,updated_at);
CREATE TABLE IF NOT EXISTS wm_chat_hides(user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,last_message_id INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,kind,chat_id));
DROP VIEW IF EXISTS wm_public_users;
CREATE VIEW wm_public_users AS SELECT u.id,COALESCE(NULLIF(d.display_name,''),u.name) name,CASE WHEN d.picture_id IS NOT NULL THEN '/avatar/'||u.id||'?v='||d.updated_at ELSE COALESCE(NULLIF(u.picture,''),'/assets/default-avatar.svg') END picture,CASE WHEN d.cover_id IS NOT NULL THEN '/cover/'||u.id||'?v='||d.updated_at ELSE '/assets/profile-cover.webp' END cover,COALESCE(d.bio,'') bio,(EXISTS(SELECT 1 FROM wm_roles vr WHERE vr.user_id=u.id AND vr.role='owner') OR EXISTS(SELECT 1 FROM wm_verifications v WHERE v.user_id=u.id)) verified,EXISTS(SELECT 1 FROM wm_seller_badges sb WHERE sb.user_id=u.id) trusted_seller,u.created_at,u.updated_at FROM users u LEFT JOIN wm_profile_details d ON d.user_id=u.id;

UPDATE wm_messages SET archived_at=(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) WHERE archived_at IS NULL;
UPDATE wm_group_messages SET archived_at=(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) WHERE archived_at IS NULL;
INSERT INTO wm_settings(key,value) VALUES('chat_archive_before',CAST((CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AS TEXT)) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
