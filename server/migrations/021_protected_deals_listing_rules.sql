-- Protected deal steps, secure handover, deal proofs and listing rules.
-- Additive only: no user, post, message, deal, upload or counter is deleted or rewritten.
-- Existing deals keep flow=0 and finish with their original rules; only new deals use flow=1.
ALTER TABLE wm_deals ADD COLUMN flow INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wm_deals ADD COLUMN paid_at INTEGER;
ALTER TABLE wm_deals ADD COLUMN paid_note TEXT NOT NULL DEFAULT '';
ALTER TABLE wm_deals ADD COLUMN funded_at INTEGER;
ALTER TABLE wm_deals ADD COLUMN funded_by TEXT REFERENCES users(id);
ALTER TABLE wm_deals ADD COLUMN payment_trx TEXT NOT NULL DEFAULT '';
ALTER TABLE wm_deals ADD COLUMN payment_proof_id TEXT;
ALTER TABLE wm_deals ADD COLUMN delivered_at INTEGER;
ALTER TABLE wm_deals ADD COLUMN checklist TEXT NOT NULL DEFAULT '';
ALTER TABLE wm_deals ADD COLUMN checklist_proof_id TEXT;
ALTER TABLE wm_deals ADD COLUMN buyer_done_at INTEGER;
ALTER TABLE wm_deals ADD COLUMN payout_note TEXT NOT NULL DEFAULT '';
ALTER TABLE wm_deals ADD COLUMN dispute_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE wm_deals ADD COLUMN disputed_by TEXT REFERENCES users(id);
ALTER TABLE wm_posts ADD COLUMN game_uid_hash TEXT;
ALTER TABLE wm_posts ADD COLUMN game_uid_enc TEXT;
ALTER TABLE wm_posts ADD COLUMN game_uid_hint TEXT NOT NULL DEFAULT '';
ALTER TABLE wm_posts ADD COLUMN bumped_at INTEGER;
ALTER TABLE wm_posts ADD COLUMN renewed_at INTEGER;
ALTER TABLE wm_posts ADD COLUMN media_updated_at INTEGER;
CREATE INDEX IF NOT EXISTS wm_posts_game_uid ON wm_posts(game_uid_hash) WHERE game_uid_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS wm_posts_user_created ON wm_posts(user_id,created_at);
CREATE TABLE IF NOT EXISTS wm_uid_cooldowns(uid_hash TEXT PRIMARY KEY,until_at INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS wm_deal_handover(deal_id TEXT PRIMARY KEY REFERENCES wm_deals(id),buyer_ready_at INTEGER,submitted_at INTEGER,submit_count INTEGER NOT NULL DEFAULT 0,payload TEXT,revealed_at INTEGER,cleared_at INTEGER);
CREATE TABLE IF NOT EXISTS wm_deal_proofs(id TEXT PRIMARY KEY,deal_id TEXT NOT NULL REFERENCES wm_deals(id),user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('payment','checklist','delivery')),object_key TEXT NOT NULL UNIQUE,type TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_deal_proofs_deal ON wm_deal_proofs(deal_id,created_at);
CREATE TRIGGER IF NOT EXISTS wm_deal_uid_cooldown AFTER UPDATE OF status ON wm_deals
WHEN NEW.status='completed' AND OLD.status!='completed'
BEGIN
 INSERT INTO wm_uid_cooldowns(uid_hash,until_at,reason)
 SELECT p.game_uid_hash,COALESCE(NEW.completed_at,0)+COALESCE(json_extract((SELECT value FROM wm_settings WHERE key='market_rules'),'$.relistCooldownHours'),24)*3600000,'sold'
 FROM wm_posts p WHERE p.id=COALESCE(NEW.post_id,(SELECT post_id FROM wm_threads WHERE id=NEW.thread_id)) AND p.game_uid_hash IS NOT NULL AND p.post_intent='sell'
 ON CONFLICT(uid_hash) DO UPDATE SET until_at=MAX(wm_uid_cooldowns.until_at,excluded.until_at),reason=excluded.reason;
END;
