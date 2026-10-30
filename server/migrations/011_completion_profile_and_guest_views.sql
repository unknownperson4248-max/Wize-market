ALTER TABLE wm_deals ADD COLUMN admin_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wm_deals ADD COLUMN completed_at INTEGER;
ALTER TABLE wm_deals ADD COLUMN direct_completion_started_at INTEGER;
ALTER TABLE wm_deals ADD COLUMN completion_note TEXT NOT NULL DEFAULT '';
UPDATE wm_deals SET completed_at=COALESCE((SELECT MAX(created_at) FROM wm_deal_events WHERE deal_id=wm_deals.id),created_at) WHERE status='completed';
UPDATE wm_deal_cancel_requests SET resolved_at=COALESCE((SELECT completed_at FROM wm_deals WHERE id=deal_id),created_at),resolution='rejected' WHERE resolved_at IS NULL AND EXISTS(SELECT 1 FROM wm_deals d WHERE d.id=deal_id AND d.status IN ('completed','cancelled'));
CREATE TABLE wm_guest_post_views(post_id TEXT NOT NULL REFERENCES wm_posts(id),visitor_hash TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(post_id,visitor_hash));
CREATE TRIGGER wm_username_cooldown BEFORE UPDATE OF username ON wm_profiles WHEN NEW.username!=OLD.username AND NEW.updated_at<OLD.updated_at+604800000 BEGIN SELECT RAISE(ABORT,'username_cooldown'); END;
