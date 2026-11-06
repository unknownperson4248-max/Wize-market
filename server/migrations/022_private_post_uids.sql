-- Keep private game UID data out of wm_posts, so no post query (including older code after a rollback) can return it.
-- Moves any UID values written by migration 021 code into wm_post_uids; nothing else is changed. Safe to run more than once.
CREATE TABLE IF NOT EXISTS wm_post_uids(post_id TEXT PRIMARY KEY REFERENCES wm_posts(id),uid_hash TEXT NOT NULL,uid_enc TEXT,uid_hint TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_post_uids_hash ON wm_post_uids(uid_hash);
INSERT OR IGNORE INTO wm_post_uids(post_id,uid_hash,uid_enc,uid_hint,created_at) SELECT id,game_uid_hash,game_uid_enc,game_uid_hint,COALESCE(updated_at,created_at) FROM wm_posts WHERE game_uid_hash IS NOT NULL;
UPDATE wm_posts SET game_uid_hash=NULL,game_uid_enc=NULL,game_uid_hint='' WHERE game_uid_hash IS NOT NULL OR game_uid_enc IS NOT NULL OR game_uid_hint!='';
DROP TRIGGER IF EXISTS wm_deal_uid_cooldown;
CREATE TRIGGER IF NOT EXISTS wm_deal_uid_cooldown AFTER UPDATE OF status ON wm_deals
WHEN NEW.status='completed' AND OLD.status!='completed'
BEGIN
 INSERT INTO wm_uid_cooldowns(uid_hash,until_at,reason)
 SELECT x.uid_hash,COALESCE(NEW.completed_at,0)+COALESCE(json_extract((SELECT value FROM wm_settings WHERE key='market_rules'),'$.relistCooldownHours'),24)*3600000,'sold'
 FROM wm_post_uids x JOIN wm_posts p ON p.id=x.post_id WHERE x.post_id=COALESCE(NEW.post_id,(SELECT post_id FROM wm_threads WHERE id=NEW.thread_id)) AND p.post_intent='sell'
 ON CONFLICT(uid_hash) DO UPDATE SET until_at=MAX(wm_uid_cooldowns.until_at,excluded.until_at),reason=excluded.reason;
END;
