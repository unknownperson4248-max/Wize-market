ALTER TABLE wm_deals ADD COLUMN account_name TEXT NOT NULL DEFAULT '';
UPDATE wm_deals SET account_name=COALESCE((SELECT p.title FROM wm_threads t JOIN wm_posts p ON p.id=COALESCE(wm_deals.post_id,t.post_id) WHERE t.id=wm_deals.thread_id),'Marketplace listing') WHERE account_name='';
CREATE TABLE wm_deal_cancel_requests(deal_id TEXT NOT NULL REFERENCES wm_deals(id),user_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,created_at INTEGER NOT NULL,resolved_at INTEGER,resolved_by TEXT REFERENCES users(id),resolution TEXT CHECK(resolution IN ('approved','rejected')),PRIMARY KEY(deal_id,user_id));
CREATE INDEX wm_cancel_pending ON wm_deal_cancel_requests(deal_id,resolved_at);
UPDATE wm_deals SET status='awaiting_seller',version=version+1 WHERE mode='mediated' AND status='awaiting_admin' AND seller_ok=0;
