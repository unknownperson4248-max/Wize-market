ALTER TABLE wm_posts ADD COLUMN availability TEXT NOT NULL DEFAULT 'available' CHECK(availability IN ('available','sold'));
CREATE TRIGGER IF NOT EXISTS wm_deal_auto_sold AFTER UPDATE OF status ON wm_deals
WHEN NEW.status='completed' AND OLD.status!='completed'
BEGIN
 UPDATE wm_posts SET availability='sold',updated_at=NEW.completed_at,version=version+1
 WHERE id=COALESCE(NEW.post_id,(SELECT post_id FROM wm_threads WHERE id=NEW.thread_id))
 AND post_intent='sell' AND kind='Game ID' AND availability!='sold';
END;
UPDATE wm_posts SET availability='sold',version=version+1
WHERE post_intent='sell' AND kind='Game ID' AND availability!='sold' AND id IN (
 SELECT COALESCE(d.post_id,t.post_id) FROM wm_deals d JOIN wm_threads t ON t.id=d.thread_id WHERE d.status='completed'
);
