-- Run once on the existing database. New databases use server/schema.sql.
ALTER TABLE wm_groups ADD COLUMN logo_id TEXT;
ALTER TABLE wm_posts ADD COLUMN range_id TEXT;
CREATE TABLE IF NOT EXISTS wm_group_ranges(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES wm_groups(id),label TEXT NOT NULL,min_price INTEGER NOT NULL,max_price INTEGER,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_group_ranges_group ON wm_group_ranges(group_id,min_price);
INSERT INTO wm_group_ranges(id,group_id,label,min_price,max_price,created_at) SELECT lower(hex(randomblob(16))),g.id,CASE WHEN g.price IS NULL THEN '৳0–5,000' ELSE 'Up to ৳'||g.price END,0,COALESCE(g.price,5000),g.created_at FROM wm_groups g WHERE NOT EXISTS(SELECT 1 FROM wm_group_ranges r WHERE r.group_id=g.id);
INSERT INTO wm_group_ranges(id,group_id,label,min_price,max_price,created_at) SELECT lower(hex(randomblob(16))),g.id,'৳5,001–10,000',5001,10000,g.created_at FROM wm_groups g WHERE g.price IS NULL AND NOT EXISTS(SELECT 1 FROM wm_group_ranges r WHERE r.group_id=g.id AND r.min_price=5001);
INSERT INTO wm_group_ranges(id,group_id,label,min_price,max_price,created_at) SELECT lower(hex(randomblob(16))),g.id,'৳10,001+',10001,NULL,g.created_at FROM wm_groups g WHERE g.price IS NULL AND NOT EXISTS(SELECT 1 FROM wm_group_ranges r WHERE r.group_id=g.id AND r.min_price=10001);
UPDATE wm_posts SET range_id=(SELECT r.id FROM wm_group_ranges r WHERE r.group_id=wm_posts.group_id AND wm_posts.price>=r.min_price AND (r.max_price IS NULL OR wm_posts.price<=r.max_price) ORDER BY r.min_price LIMIT 1) WHERE group_id IS NOT NULL AND kind='Game ID' AND range_id IS NULL;
