-- Additive only: existing posts are Sell posts; UUIDs and counters are retained.
ALTER TABLE wm_posts ADD COLUMN post_intent TEXT NOT NULL DEFAULT 'sell' CHECK(post_intent IN ('sell','need'));
ALTER TABLE wm_posts ADD COLUMN description TEXT NOT NULL DEFAULT '';
CREATE TABLE wm_thread_posts (
 thread_id TEXT NOT NULL REFERENCES wm_threads(id), post_id TEXT NOT NULL REFERENCES wm_posts(id),
 created_at INTEGER NOT NULL, PRIMARY KEY(thread_id,post_id)
);
CREATE TABLE wm_notification_preferences (
 user_id TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL CHECK(category IN ('friend_requests','message_requests','private_messages','group_messages','deal_updates')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,category)
);
CREATE TABLE wm_notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id), actor_id TEXT REFERENCES users(id),
 category TEXT NOT NULL, event_key TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
 target_type TEXT NOT NULL CHECK(target_type IN ('profile','private','group','deal')), target_id TEXT NOT NULL,
 created_at INTEGER NOT NULL, read_at INTEGER, alert_enabled INTEGER NOT NULL DEFAULT 1 CHECK(alert_enabled IN (0,1)),
 UNIQUE(user_id,event_key)
);
CREATE INDEX wm_notifications_inbox ON wm_notifications(user_id,id DESC);
CREATE INDEX wm_notifications_unread ON wm_notifications(user_id,category) WHERE read_at IS NULL AND alert_enabled=1;
-- Preserve both earlier group mute controls in one authoritative preference.
INSERT INTO wm_chat_preferences(user_id,kind,chat_id,muted,updated_at)
 SELECT gm.user_id,'group',gm.group_id,CAST(s.value AS INTEGER),CAST(strftime('%s','now') AS INTEGER)*1000
 FROM wm_group_members gm JOIN wm_settings s ON s.key='mute:'||gm.user_id||':'||gm.group_id
 WHERE s.value IN ('0','1')
 ON CONFLICT(user_id,kind,chat_id) DO UPDATE SET muted=MAX(wm_chat_preferences.muted,excluded.muted);
-- Notification writes execute in the source event's transaction. Existing history is not backfilled.
CREATE TRIGGER wm_notify_friend_insert AFTER INSERT ON wm_friend_requests
WHEN NEW.status='pending'
BEGIN
 INSERT OR IGNORE INTO wm_notifications(user_id,actor_id,category,event_key,kind,title,target_type,target_id,created_at,alert_enabled)
 SELECT NEW.to_id,NEW.from_id,'friend_requests','friend:request:'||NEW.pair_key||':'||NEW.updated_at,'friend_request','New friend request','profile',NEW.from_id,NEW.updated_at,
 COALESCE((SELECT enabled FROM wm_notification_preferences WHERE user_id=NEW.to_id AND category='friend_requests'),1);
END;
CREATE TRIGGER wm_notify_friend_request AFTER UPDATE OF status ON wm_friend_requests
WHEN NEW.status='pending' AND OLD.status!='pending'
BEGIN
 INSERT OR IGNORE INTO wm_notifications(user_id,actor_id,category,event_key,kind,title,target_type,target_id,created_at,alert_enabled)
 SELECT NEW.to_id,NEW.from_id,'friend_requests','friend:request:'||NEW.pair_key||':'||NEW.updated_at,'friend_request','New friend request','profile',NEW.from_id,NEW.updated_at,
 COALESCE((SELECT enabled FROM wm_notification_preferences WHERE user_id=NEW.to_id AND category='friend_requests'),1);
END;
CREATE TRIGGER wm_notify_friend_accept AFTER UPDATE OF status ON wm_friend_requests
WHEN NEW.status='accepted' AND OLD.status='pending'
BEGIN
 INSERT OR IGNORE INTO wm_notifications(user_id,actor_id,category,event_key,kind,title,target_type,target_id,created_at,alert_enabled)
 SELECT NEW.from_id,NEW.to_id,'friend_requests','friend:accepted:'||NEW.pair_key||':'||NEW.updated_at,'friend_accepted','Friend request accepted','profile',NEW.to_id,NEW.updated_at,
 COALESCE((SELECT enabled FROM wm_notification_preferences WHERE user_id=NEW.from_id AND category='friend_requests'),1);
END;
CREATE TRIGGER wm_notify_message_request AFTER INSERT ON wm_threads
WHEN NEW.is_deal=0 AND NEW.status='requested'
BEGIN
 INSERT OR IGNORE INTO wm_notifications(user_id,actor_id,category,event_key,kind,title,target_type,target_id,created_at,alert_enabled)
 SELECT NEW.seller_id,NEW.buyer_id,'message_requests','request:'||NEW.id,'message_request','New message request','private',NEW.id,NEW.created_at,
 COALESCE((SELECT enabled FROM wm_notification_preferences WHERE user_id=NEW.seller_id AND category='message_requests'),1)*(1)
  ;
END;
CREATE TRIGGER wm_notify_private_message AFTER INSERT ON wm_messages
BEGIN
 INSERT OR IGNORE INTO wm_notifications(user_id,actor_id,category,event_key,kind,title,target_type,target_id,created_at,alert_enabled)
 SELECT CASE WHEN t.buyer_id=NEW.user_id THEN t.seller_id ELSE t.buyer_id END,NEW.user_id,'private_messages','private:'||NEW.id,'private_message','New private message','private',NEW.thread_id,NEW.created_at,
 COALESCE((SELECT enabled FROM wm_notification_preferences WHERE user_id=CASE WHEN t.buyer_id=NEW.user_id THEN t.seller_id ELSE t.buyer_id END AND category='private_messages'),1)*(1-COALESCE((SELECT muted FROM wm_chat_preferences WHERE user_id=CASE WHEN t.buyer_id=NEW.user_id THEN t.seller_id ELSE t.buyer_id END AND kind='private' AND chat_id=t.id),0))
 FROM wm_threads t WHERE t.id=NEW.thread_id AND t.is_deal=0 AND t.status='accepted' AND NOT EXISTS(SELECT 1 FROM wm_user_blocks b WHERE (b.user_id=t.buyer_id AND b.target_id=t.seller_id) OR (b.user_id=t.seller_id AND b.target_id=t.buyer_id));
END;
CREATE TRIGGER wm_notify_group_message AFTER INSERT ON wm_group_messages
BEGIN
 INSERT OR IGNORE INTO wm_notifications(user_id,actor_id,category,event_key,kind,title,target_type,target_id,created_at,alert_enabled)
 SELECT gm.user_id,NEW.user_id,'group_messages','group:'||NEW.id,'group_message','New group message','group',NEW.group_id,NEW.created_at,
 COALESCE((SELECT enabled FROM wm_notification_preferences WHERE user_id=gm.user_id AND category='group_messages'),1)*(1-COALESCE((SELECT muted FROM wm_chat_preferences WHERE user_id=gm.user_id AND kind='group' AND chat_id=NEW.group_id),0))
 FROM wm_group_members gm WHERE gm.group_id=NEW.group_id AND gm.user_id!=NEW.user_id AND NOT EXISTS(SELECT 1 FROM wm_user_blocks b WHERE b.user_id=gm.user_id AND b.target_id=NEW.user_id) AND NOT EXISTS(SELECT 1 FROM wm_chat_preferences cp WHERE cp.user_id=gm.user_id AND cp.kind='group' AND cp.chat_id=NEW.group_id AND cp.blocked=1);
END;
CREATE TRIGGER wm_notify_deal_event AFTER INSERT ON wm_deal_events
BEGIN
 INSERT OR IGNORE INTO wm_notifications(user_id,actor_id,category,event_key,kind,title,target_type,target_id,created_at,alert_enabled)
 SELECT u.id,NEW.user_id,'deal_updates','deal:event:'||NEW.id,'deal_update',CASE WHEN NEW.action='requested' THEN 'New deal request' WHEN NEW.action IN ('accept','activate') THEN 'Admin accepted the deal' WHEN NEW.action='reject' THEN 'Admin rejected the deal' WHEN NEW.action LIKE 'chat:%' THEN 'New deal message' ELSE 'Deal status updated' END,'deal',NEW.deal_id,NEW.created_at,
 COALESCE((SELECT enabled FROM wm_notification_preferences WHERE user_id=u.id AND category='deal_updates'),1)*(1)
 FROM wm_deals d JOIN users u ON u.id IN (d.buyer_id,d.seller_id,d.admin_id) WHERE d.id=NEW.deal_id AND u.id!=NEW.user_id;
END;
