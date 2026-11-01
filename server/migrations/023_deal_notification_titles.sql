-- Clearer deal notification titles for the simple deal steps (shown in the in-app deal popup).
-- Only the trigger text changes; no notification, deal or message is altered.
DROP TRIGGER IF EXISTS wm_notify_deal_event;
CREATE TRIGGER wm_notify_deal_event AFTER INSERT ON wm_deal_events
BEGIN
 INSERT OR IGNORE INTO wm_notifications(user_id,actor_id,category,event_key,kind,title,target_type,target_id,created_at,alert_enabled)
 SELECT u.id,NEW.user_id,'deal_updates','deal:event:'||NEW.id,'deal_update',CASE WHEN NEW.action='requested' THEN 'New deal request' WHEN NEW.action IN ('accept','activate') THEN 'Admin accepted the deal' WHEN NEW.action='reject' THEN 'Admin rejected the deal' WHEN NEW.action LIKE 'chat:%' THEN 'New deal message' WHEN NEW.action='payment_sent' THEN 'Buyer sent the money' WHEN NEW.action='payment_received' THEN 'Admin received the money' WHEN NEW.action='delivered' THEN 'Seller handed over the ID' WHEN NEW.action='buyer_confirmed' THEN 'Buyer got the ID' WHEN NEW.action IN ('seller_paid','finalize') THEN 'Deal completed' WHEN NEW.action='dispute' THEN 'Dispute raised' WHEN NEW.action IN ('resolve_dispute','resolve_redeliver') THEN 'Dispute resolved' WHEN NEW.action='cancel' THEN 'Deal cancelled' WHEN NEW.action='cancel_requested' THEN 'Cancellation requested' WHEN NEW.action='handover_submitted' THEN 'Login details sent securely' ELSE 'Deal status updated' END,'deal',NEW.deal_id,NEW.created_at,
 COALESCE((SELECT enabled FROM wm_notification_preferences WHERE user_id=u.id AND category='deal_updates'),1)*(1)
 FROM wm_deals d JOIN users u ON u.id IN (d.buyer_id,d.seller_id,d.admin_id) WHERE d.id=NEW.deal_id AND u.id!=NEW.user_id;
END;
