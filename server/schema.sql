CREATE TABLE IF NOT EXISTS wm_roles(user_id TEXT PRIMARY KEY REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('owner','trusted')));
CREATE TABLE IF NOT EXISTS wm_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wm_groups(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,price INTEGER,logo_id TEXT,created_at INTEGER NOT NULL,join_approval INTEGER NOT NULL DEFAULT 0,admins_only INTEGER NOT NULL DEFAULT 0,invite_code TEXT,invite_enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS wm_group_members(group_id TEXT NOT NULL REFERENCES wm_groups(id),user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(group_id,user_id));
CREATE TABLE IF NOT EXISTS wm_posts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),group_id TEXT REFERENCES wm_groups(id),range_id TEXT,title TEXT NOT NULL,details TEXT NOT NULL,price INTEGER,kind TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),media TEXT NOT NULL DEFAULT '[]',created_at INTEGER NOT NULL,deleted_at INTEGER,updated_at INTEGER,version INTEGER NOT NULL DEFAULT 0,game_category TEXT NOT NULL DEFAULT 'free-fire',price_format TEXT NOT NULL DEFAULT 'full',custom_game_name TEXT NOT NULL DEFAULT '',post_intent TEXT NOT NULL DEFAULT 'sell' CHECK(post_intent IN ('sell','need')),description TEXT NOT NULL DEFAULT '',availability TEXT NOT NULL DEFAULT 'available' CHECK(availability IN ('available','sold')),game_uid_hash TEXT,game_uid_enc TEXT,game_uid_hint TEXT NOT NULL DEFAULT '',bumped_at INTEGER,renewed_at INTEGER,media_updated_at INTEGER);
CREATE TABLE IF NOT EXISTS wm_uploads(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),type TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_threads(id TEXT PRIMARY KEY,buyer_id TEXT NOT NULL REFERENCES users(id),seller_id TEXT NOT NULL REFERENCES users(id),post_id TEXT REFERENCES wm_posts(id),pair_key TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'requested',created_at INTEGER NOT NULL,is_deal INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS wm_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,thread_id TEXT NOT NULL REFERENCES wm_threads(id),user_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created_at INTEGER NOT NULL,deleted_at INTEGER,archived_at INTEGER,post_id TEXT REFERENCES wm_posts(id));
CREATE TABLE IF NOT EXISTS wm_group_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,group_id TEXT NOT NULL REFERENCES wm_groups(id),user_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created_at INTEGER NOT NULL,deleted_at INTEGER,archived_at INTEGER);
CREATE TABLE IF NOT EXISTS wm_follows(user_id TEXT NOT NULL REFERENCES users(id),target_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,target_id),CHECK(user_id!=target_id));
CREATE TABLE IF NOT EXISTS wm_deals(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES wm_threads(id),buyer_id TEXT NOT NULL REFERENCES users(id),seller_id TEXT NOT NULL REFERENCES users(id),admin_id TEXT REFERENCES users(id),price INTEGER NOT NULL,fee INTEGER NOT NULL DEFAULT 0,buyer_ok INTEGER NOT NULL DEFAULT 0,seller_ok INTEGER NOT NULL DEFAULT 0,buyer_done INTEGER NOT NULL DEFAULT 0,seller_done INTEGER NOT NULL DEFAULT 0,post_id TEXT REFERENCES wm_posts(id),mode TEXT NOT NULL DEFAULT 'mediated',account_name TEXT NOT NULL DEFAULT '',admin_done INTEGER NOT NULL DEFAULT 0,completed_at INTEGER,direct_completion_started_at INTEGER,completion_note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'proposed',version INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,flow INTEGER NOT NULL DEFAULT 0,paid_at INTEGER,paid_note TEXT NOT NULL DEFAULT '',funded_at INTEGER,funded_by TEXT REFERENCES users(id),payment_trx TEXT NOT NULL DEFAULT '',payment_proof_id TEXT,delivered_at INTEGER,checklist TEXT NOT NULL DEFAULT '',checklist_proof_id TEXT,buyer_done_at INTEGER,payout_note TEXT NOT NULL DEFAULT '',dispute_reason TEXT NOT NULL DEFAULT '',disputed_by TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS wm_deal_events(id INTEGER PRIMARY KEY AUTOINCREMENT,deal_id TEXT NOT NULL REFERENCES wm_deals(id),user_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_posts_status_time ON wm_posts(status,created_at);
CREATE INDEX IF NOT EXISTS wm_posts_group ON wm_posts(group_id,status,created_at);
CREATE INDEX IF NOT EXISTS wm_messages_thread ON wm_messages(thread_id,id);
CREATE INDEX IF NOT EXISTS wm_group_chat ON wm_group_messages(group_id,id);
CREATE INDEX IF NOT EXISTS wm_threads_buyer ON wm_threads(buyer_id,created_at);
CREATE INDEX IF NOT EXISTS wm_threads_seller ON wm_threads(seller_id,created_at);
CREATE INDEX IF NOT EXISTS wm_deals_users ON wm_deals(buyer_id,seller_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS wm_one_owner ON wm_roles(role) WHERE role='owner';
CREATE UNIQUE INDEX IF NOT EXISTS wm_one_active_deal ON wm_deals(thread_id) WHERE status NOT IN ('completed','cancelled');

CREATE TABLE IF NOT EXISTS wm_group_ranges(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES wm_groups(id),label TEXT NOT NULL,min_price INTEGER NOT NULL,max_price INTEGER,created_at INTEGER NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS wm_group_ranges_group ON wm_group_ranges(group_id,min_price);
CREATE TABLE IF NOT EXISTS wm_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),username TEXT UNIQUE NOT NULL COLLATE NOCASE,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_suspensions(user_id TEXT PRIMARY KEY REFERENCES users(id),until_at INTEGER NOT NULL,reason TEXT NOT NULL,post_id TEXT,appealed INTEGER NOT NULL DEFAULT 0,appeal_text TEXT,appeal_at INTEGER,appeal_note TEXT);
CREATE TABLE IF NOT EXISTS wm_safety_events(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),decision TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_safety_post ON wm_safety_events(post_id,created_at);
CREATE TABLE IF NOT EXISTS wm_admin_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS wm_profile_details(user_id TEXT PRIMARY KEY REFERENCES users(id),display_name TEXT,bio TEXT NOT NULL DEFAULT '',picture_id TEXT,updated_at INTEGER NOT NULL,cover_id TEXT,links TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS wm_media_checks(upload_id TEXT PRIMARY KEY REFERENCES wm_uploads(id),decision TEXT NOT NULL,reason TEXT NOT NULL,checked_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_saved_posts(user_id TEXT NOT NULL REFERENCES users(id),post_id TEXT NOT NULL REFERENCES wm_posts(id),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,post_id));
CREATE TABLE IF NOT EXISTS wm_post_likes(user_id TEXT NOT NULL REFERENCES users(id),post_id TEXT NOT NULL REFERENCES wm_posts(id),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,post_id));
CREATE INDEX IF NOT EXISTS wm_likes_post ON wm_post_likes(post_id);
CREATE TABLE IF NOT EXISTS wm_post_comments(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created_at INTEGER NOT NULL,deleted_at INTEGER);
CREATE INDEX IF NOT EXISTS wm_comments_post ON wm_post_comments(post_id,created_at);
CREATE TABLE IF NOT EXISTS wm_deal_reviews(id TEXT PRIMARY KEY,deal_id TEXT NOT NULL REFERENCES wm_deals(id),reviewer_id TEXT NOT NULL REFERENCES users(id),target_id TEXT NOT NULL REFERENCES users(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comment TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(deal_id,reviewer_id));
CREATE TABLE IF NOT EXISTS wm_verifications(user_id TEXT PRIMARY KEY REFERENCES users(id),granted_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_seller_badges(user_id TEXT PRIMARY KEY REFERENCES users(id),granted_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_post_views(post_id TEXT NOT NULL REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(post_id,user_id));
CREATE TABLE IF NOT EXISTS wm_post_shares(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,UNIQUE(post_id,user_id));
CREATE INDEX IF NOT EXISTS wm_shares_user ON wm_post_shares(user_id,created_at);
CREATE INDEX IF NOT EXISTS wm_shares_post ON wm_post_shares(post_id);
CREATE TABLE IF NOT EXISTS wm_reports(id TEXT PRIMARY KEY,post_id TEXT REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,details TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),created_at INTEGER NOT NULL,resolved_by TEXT REFERENCES users(id),resolved_at INTEGER,attachment_id TEXT REFERENCES wm_private_uploads(id));
CREATE INDEX IF NOT EXISTS wm_reports_status ON wm_reports(status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS wm_reports_one_open ON wm_reports(user_id,post_id) WHERE status='open' AND post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wm_posts_category_price ON wm_posts(game_category,status,price,created_at);
CREATE TABLE IF NOT EXISTS wm_friend_requests(pair_key TEXT PRIMARY KEY,from_id TEXT NOT NULL REFERENCES users(id),to_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled')),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,CHECK(from_id!=to_id));
CREATE INDEX IF NOT EXISTS wm_friend_recipient ON wm_friend_requests(to_id,status,updated_at);
CREATE TABLE IF NOT EXISTS wm_chat_hides(user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,last_message_id INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,kind,chat_id));
CREATE VIEW wm_public_users AS SELECT u.id,COALESCE(NULLIF(d.display_name,''),u.name) name,CASE WHEN d.picture_id IS NOT NULL THEN '/avatar/'||u.id||'?v='||d.updated_at ELSE COALESCE(NULLIF(u.picture,''),'/assets/default-avatar.svg') END picture,CASE WHEN d.cover_id IS NOT NULL THEN '/cover/'||u.id||'?v='||d.updated_at ELSE '/assets/profile-cover.webp' END cover,COALESCE(d.bio,'') bio,(EXISTS(SELECT 1 FROM wm_roles vr WHERE vr.user_id=u.id AND vr.role='owner') OR EXISTS(SELECT 1 FROM wm_verifications v WHERE v.user_id=u.id)) verified,EXISTS(SELECT 1 FROM wm_seller_badges sb WHERE sb.user_id=u.id) trusted_seller,u.created_at,u.updated_at FROM users u LEFT JOIN wm_profile_details d ON d.user_id=u.id;

CREATE TABLE wm_listing_ids(number INTEGER PRIMARY KEY AUTOINCREMENT,post_id TEXT NOT NULL UNIQUE REFERENCES wm_posts(id));
CREATE TRIGGER wm_listing_number AFTER INSERT ON wm_posts BEGIN INSERT INTO wm_listing_ids(post_id) VALUES(NEW.id); END;
CREATE TABLE wm_deal_ids(number INTEGER PRIMARY KEY AUTOINCREMENT,deal_id TEXT NOT NULL UNIQUE REFERENCES wm_deals(id));
CREATE TRIGGER wm_deal_number AFTER INSERT ON wm_deals BEGIN INSERT INTO wm_deal_ids(deal_id) VALUES(NEW.id); END;
CREATE TABLE wm_post_groups(post_id TEXT NOT NULL REFERENCES wm_posts(id),group_id TEXT NOT NULL REFERENCES wm_groups(id),range_id TEXT REFERENCES wm_group_ranges(id),PRIMARY KEY(post_id,group_id));
CREATE INDEX wm_post_groups_feed ON wm_post_groups(group_id,range_id,post_id);

CREATE TABLE wm_deal_cancel_requests(deal_id TEXT NOT NULL REFERENCES wm_deals(id),user_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,created_at INTEGER NOT NULL,resolved_at INTEGER,resolved_by TEXT REFERENCES users(id),resolution TEXT CHECK(resolution IN ('approved','rejected')),PRIMARY KEY(deal_id,user_id));
CREATE INDEX wm_cancel_pending ON wm_deal_cancel_requests(deal_id,resolved_at);

CREATE TABLE wm_guest_post_views(post_id TEXT NOT NULL REFERENCES wm_posts(id),visitor_hash TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(post_id,visitor_hash));
CREATE TRIGGER wm_username_cooldown BEFORE UPDATE OF username ON wm_profiles WHEN NEW.username!=OLD.username AND NEW.updated_at<OLD.updated_at+604800000 BEGIN SELECT RAISE(ABORT,'username_cooldown'); END;

CREATE TABLE wm_hidden_posts(user_id TEXT NOT NULL REFERENCES users(id),post_id TEXT NOT NULL REFERENCES wm_posts(id),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,post_id));
CREATE INDEX wm_hidden_post ON wm_hidden_posts(post_id);

-- Existing members keep their current abilities. Only the owner edits these overrides.
CREATE TABLE IF NOT EXISTS wm_member_permissions (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 can_post INTEGER NOT NULL DEFAULT 1 CHECK(can_post IN (0,1)),
 can_message INTEGER NOT NULL DEFAULT 1 CHECK(can_message IN (0,1)),
 can_start_deal INTEGER NOT NULL DEFAULT 1 CHECK(can_start_deal IN (0,1)),
 updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at INTEGER NOT NULL
);

-- Personal inbox controls never delete another member's history or deal records.
CREATE TABLE IF NOT EXISTS wm_user_blocks (
 user_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL, PRIMARY KEY(user_id,target_id), CHECK(user_id!=target_id)
);
CREATE INDEX IF NOT EXISTS wm_blocks_target ON wm_user_blocks(target_id);
CREATE TABLE IF NOT EXISTS wm_chat_preferences (
 user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('private','group')),
 chat_id TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)), muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1)),
 deleted_before INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,kind,chat_id)
);
CREATE TABLE IF NOT EXISTS wm_pwa_icons (
 upload_id TEXT PRIMARY KEY REFERENCES wm_uploads(id), created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);

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
 SELECT u.id,NEW.user_id,'deal_updates','deal:event:'||NEW.id,'deal_update',CASE WHEN NEW.action='requested' THEN 'New deal request' WHEN NEW.action='confirm' AND d.buyer_ok=1 AND d.seller_ok=1 AND u.id=d.admin_id THEN 'New deal request' WHEN NEW.action='confirm' AND d.buyer_ok=1 AND d.seller_ok=1 THEN 'Both agreed on the Admin' WHEN NEW.action='confirm' THEN 'Deal terms agreed' WHEN NEW.action='admin_changed' THEN 'Another Admin was suggested' WHEN NEW.action IN ('accept','activate') THEN 'Admin accepted the deal' WHEN NEW.action='reject' THEN 'Admin rejected the deal' WHEN NEW.action LIKE 'chat:%' THEN 'New deal message' WHEN NEW.action='payment_sent' THEN 'Buyer sent the money' WHEN NEW.action='payment_received' THEN 'Admin received the money' WHEN NEW.action='delivered' THEN 'Seller handed over the ID' WHEN NEW.action='buyer_confirmed' THEN 'Buyer got the ID' WHEN NEW.action IN ('seller_paid','finalize') THEN 'Deal completed' WHEN NEW.action='dispute' THEN 'Dispute raised' WHEN NEW.action IN ('resolve_dispute','resolve_redeliver') THEN 'Dispute resolved' WHEN NEW.action='cancel' THEN 'Deal cancelled' WHEN NEW.action='cancel_requested' THEN 'Cancellation requested' WHEN NEW.action='handover_submitted' THEN 'Login details sent securely' ELSE 'Deal status updated' END,'deal',NEW.deal_id,NEW.created_at,
 COALESCE((SELECT enabled FROM wm_notification_preferences WHERE user_id=u.id AND category='deal_updates'),1)*(1)
 FROM wm_deals d JOIN users u ON u.id IN (d.buyer_id,d.seller_id,d.admin_id) WHERE d.id=NEW.deal_id AND u.id!=NEW.user_id
  AND (u.id IN (d.buyer_id,d.seller_id) OR d.mode='direct' OR (d.buyer_ok=1 AND d.seller_ok=1) OR d.status NOT IN ('proposed','awaiting_seller','awaiting_admin'));
END;

-- Message counts use per-member read cursors, independently of the retired bell.
-- No message, preference or historical event is deleted.
CREATE TABLE IF NOT EXISTS wm_chat_reads (
 user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('private','group')),
 chat_id TEXT NOT NULL,
 last_read_id INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,kind,chat_id)
);
CREATE INDEX IF NOT EXISTS wm_messages_live_thread ON wm_messages(thread_id,id) WHERE archived_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS wm_group_messages_live_group ON wm_group_messages(group_id,id) WHERE archived_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS wm_group_members_user ON wm_group_members(user_id,group_id);

-- Carry current unread message history forward; old, already-read conversations
-- start at their latest message rather than flooding users with historical counts.
INSERT OR IGNORE INTO wm_chat_reads(user_id,kind,chat_id,last_read_id,updated_at)
 SELECT u.id,'private',t.id,COALESCE(
  (SELECT MIN(CAST(substr(n.event_key,9) AS INTEGER))-1 FROM wm_notifications n WHERE n.user_id=u.id AND n.target_type='private' AND n.target_id=t.id AND n.kind='private_message' AND n.read_at IS NULL),
  (SELECT MIN(m.id)-1 FROM wm_messages m WHERE m.thread_id=t.id AND m.user_id!=u.id AND m.deleted_at IS NULL AND m.archived_at IS NULL AND EXISTS(SELECT 1 FROM wm_notifications n WHERE n.user_id=u.id AND n.target_id=t.id AND n.kind='message_request' AND n.read_at IS NULL)),
  (SELECT MAX(m.id) FROM wm_messages m WHERE m.thread_id=t.id),0),CAST(strftime('%s','now') AS INTEGER)*1000
 FROM wm_threads t JOIN users u ON u.id IN (t.buyer_id,t.seller_id) WHERE t.is_deal=0;
INSERT OR IGNORE INTO wm_chat_reads(user_id,kind,chat_id,last_read_id,updated_at)
 SELECT gm.user_id,'group',gm.group_id,COALESCE(
  (SELECT MIN(CAST(substr(n.event_key,7) AS INTEGER))-1 FROM wm_notifications n WHERE n.user_id=gm.user_id AND n.target_type='group' AND n.target_id=gm.group_id AND n.kind='group_message' AND n.read_at IS NULL),
  (SELECT MAX(m.id) FROM wm_group_messages m WHERE m.group_id=gm.group_id),0),CAST(strftime('%s','now') AS INTEGER)*1000
 FROM wm_group_members gm;

-- Joining or rejoining a group starts at the current conversation, so earlier
-- history remains readable without counting it as newly delivered messages.
CREATE TRIGGER IF NOT EXISTS wm_group_reads_join AFTER INSERT ON wm_group_members
BEGIN
 INSERT INTO wm_chat_reads(user_id,kind,chat_id,last_read_id,updated_at)
 VALUES(NEW.user_id,'group',NEW.group_id,COALESCE((SELECT MAX(id) FROM wm_group_messages WHERE group_id=NEW.group_id),0),CAST(strftime('%s','now') AS INTEGER)*1000)
 ON CONFLICT(user_id,kind,chat_id) DO UPDATE SET last_read_id=MAX(last_read_id,excluded.last_read_id),updated_at=excluded.updated_at;
END;

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

-- Private report attachments and verification evidence are not served by public /media URLs.
CREATE TABLE IF NOT EXISTS wm_private_uploads(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('report','verification')),object_key TEXT NOT NULL UNIQUE,type TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_private_uploads_owner ON wm_private_uploads(user_id,kind,created_at);
CREATE TABLE IF NOT EXISTS wm_verification_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('seller','trusted')),contact TEXT NOT NULL,document_id TEXT NOT NULL REFERENCES wm_private_uploads(id),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),created_at INTEGER NOT NULL,reviewed_by TEXT REFERENCES users(id),reviewed_at INTEGER,whatsapp TEXT NOT NULL DEFAULT '',location_lat REAL,location_lng REAL,location_accuracy REAL,location_at INTEGER,answers TEXT NOT NULL DEFAULT '[]');
CREATE INDEX IF NOT EXISTS wm_verification_requests_user ON wm_verification_requests(user_id,created_at);
CREATE INDEX IF NOT EXISTS wm_verification_requests_status ON wm_verification_requests(status,created_at);

-- Protected deals, secure handover, deal proofs and listing rules (migration 021).
CREATE INDEX IF NOT EXISTS wm_posts_game_uid ON wm_posts(game_uid_hash) WHERE game_uid_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS wm_posts_user_created ON wm_posts(user_id,created_at);
CREATE TABLE IF NOT EXISTS wm_uid_cooldowns(uid_hash TEXT PRIMARY KEY,until_at INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS wm_deal_handover(deal_id TEXT PRIMARY KEY REFERENCES wm_deals(id),buyer_ready_at INTEGER,submitted_at INTEGER,submit_count INTEGER NOT NULL DEFAULT 0,payload TEXT,revealed_at INTEGER,cleared_at INTEGER);
CREATE TABLE IF NOT EXISTS wm_deal_proofs(id TEXT PRIMARY KEY,deal_id TEXT NOT NULL REFERENCES wm_deals(id),user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('payment','checklist','delivery')),object_key TEXT NOT NULL UNIQUE,type TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_deal_proofs_deal ON wm_deal_proofs(deal_id,created_at);
CREATE TABLE IF NOT EXISTS wm_post_uids(post_id TEXT PRIMARY KEY REFERENCES wm_posts(id),uid_hash TEXT NOT NULL,uid_enc TEXT,uid_hint TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_post_uids_hash ON wm_post_uids(uid_hash);
CREATE TRIGGER IF NOT EXISTS wm_deal_uid_cooldown AFTER UPDATE OF status ON wm_deals
WHEN NEW.status='completed' AND OLD.status!='completed'
BEGIN
 INSERT INTO wm_uid_cooldowns(uid_hash,until_at,reason)
 SELECT x.uid_hash,COALESCE(NEW.completed_at,0)+COALESCE(json_extract((SELECT value FROM wm_settings WHERE key='market_rules'),'$.relistCooldownHours'),24)*3600000,'sold'
 FROM wm_post_uids x JOIN wm_posts p ON p.id=x.post_id WHERE x.post_id=COALESCE(NEW.post_id,(SELECT post_id FROM wm_threads WHERE id=NEW.thread_id)) AND p.post_intent='sell'
 ON CONFLICT(uid_hash) DO UPDATE SET until_at=MAX(wm_uid_cooldowns.until_at,excluded.until_at),reason=excluded.reason;
END;

-- Email or phone + password sign-in (migration 024).
CREATE TABLE IF NOT EXISTS wm_credentials(user_id TEXT PRIMARY KEY REFERENCES users(id),login TEXT NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('email','phone')),password_hash TEXT NOT NULL,salt TEXT NOT NULL,failed INTEGER NOT NULL DEFAULT 0,locked_until INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);

-- Owner-assisted password reset (migration 025).
CREATE TABLE IF NOT EXISTS wm_reset_requests(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),login TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('email','phone')),created_at INTEGER NOT NULL,handled_at INTEGER,handled_by TEXT REFERENCES users(id));
CREATE INDEX IF NOT EXISTS wm_reset_requests_open ON wm_reset_requests(handled_at,created_at);
CREATE TABLE IF NOT EXISTS wm_password_resets(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER);
CREATE TABLE IF NOT EXISTS wm_message_reports(id TEXT PRIMARY KEY,reporter_id TEXT NOT NULL REFERENCES users(id),target_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,message_id INTEGER NOT NULL,message_text TEXT NOT NULL DEFAULT '',message_at INTEGER,context TEXT NOT NULL DEFAULT '[]',reason TEXT NOT NULL,details TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','actioned','dismissed')),action TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,resolved_by TEXT REFERENCES users(id),resolved_at INTEGER,UNIQUE(reporter_id,kind,message_id));
CREATE INDEX IF NOT EXISTS wm_message_reports_status ON wm_message_reports(status,created_at);
CREATE INDEX IF NOT EXISTS wm_message_reports_target ON wm_message_reports(target_id);
CREATE TABLE IF NOT EXISTS wm_chat_restrictions(user_id TEXT PRIMARY KEY REFERENCES users(id),until_at INTEGER NOT NULL,reason TEXT NOT NULL DEFAULT '',created_by TEXT REFERENCES users(id),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_calls(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES wm_threads(id),caller_id TEXT NOT NULL REFERENCES users(id),callee_id TEXT NOT NULL REFERENCES users(id),video INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'ringing' CHECK(status IN ('ringing','active','ended','declined','missed','failed')),offer TEXT NOT NULL DEFAULT '',answer TEXT,created_at INTEGER NOT NULL,answered_at INTEGER,ended_at INTEGER,ended_by TEXT,caller_seen INTEGER NOT NULL DEFAULT 0,callee_seen INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS wm_calls_callee ON wm_calls(callee_id,status,created_at);
CREATE INDEX IF NOT EXISTS wm_calls_caller ON wm_calls(caller_id,status,created_at);
CREATE TABLE IF NOT EXISTS wm_call_rooms(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('group','deal')),chat_id TEXT NOT NULL,video INTEGER NOT NULL DEFAULT 0,started_by TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'live' CHECK(status IN ('live','ended')),created_at INTEGER NOT NULL,answered_at INTEGER,ended_at INTEGER);
CREATE INDEX IF NOT EXISTS wm_call_rooms_chat ON wm_call_rooms(kind,chat_id,status);
CREATE INDEX IF NOT EXISTS wm_call_rooms_live ON wm_call_rooms(status,created_at);
CREATE INDEX IF NOT EXISTS wm_call_rooms_starter ON wm_call_rooms(started_by,created_at);
CREATE TABLE IF NOT EXISTS wm_call_room_members(room_id TEXT NOT NULL REFERENCES wm_call_rooms(id),user_id TEXT NOT NULL REFERENCES users(id),joined_at INTEGER NOT NULL,seen_at INTEGER NOT NULL,left_at INTEGER,PRIMARY KEY(room_id,user_id));
CREATE INDEX IF NOT EXISTS wm_call_room_members_user ON wm_call_room_members(user_id,left_at);
CREATE TABLE IF NOT EXISTS wm_call_signals(id INTEGER PRIMARY KEY AUTOINCREMENT,room_id TEXT NOT NULL REFERENCES wm_call_rooms(id),from_id TEXT NOT NULL REFERENCES users(id),to_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('offer','answer')),sdp TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_call_signals_to ON wm_call_signals(room_id,to_id,id);
CREATE TABLE IF NOT EXISTS wm_push_subscriptions(endpoint TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),p256dh TEXT NOT NULL DEFAULT '',auth TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,last_ok_at INTEGER,failures INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS wm_push_subscriptions_user ON wm_push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS wm_push_events(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('call','room','missed')),ref_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,url TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_push_events_user ON wm_push_events(user_id,expires_at);
CREATE INDEX IF NOT EXISTS wm_push_events_ref ON wm_push_events(ref_id);

CREATE TABLE IF NOT EXISTS wm_group_join_requests(group_id TEXT NOT NULL REFERENCES wm_groups(id),user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(group_id,user_id));
CREATE INDEX IF NOT EXISTS wm_group_join_requests_group ON wm_group_join_requests(group_id,created_at);
CREATE TABLE IF NOT EXISTS wm_chat_nicknames(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),nickname TEXT NOT NULL,set_by TEXT NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL,PRIMARY KEY(kind,chat_id,user_id));
CREATE TABLE IF NOT EXISTS wm_chat_themes(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,color TEXT NOT NULL,emoji TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL,background_id TEXT,PRIMARY KEY(kind,chat_id));
CREATE TABLE IF NOT EXISTS wm_chat_pins(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,message_id INTEGER NOT NULL,pinned_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(kind,chat_id,message_id));
CREATE INDEX IF NOT EXISTS wm_chat_pins_chat ON wm_chat_pins(kind,chat_id,created_at);
CREATE TABLE IF NOT EXISTS wm_presence(user_id TEXT PRIMARY KEY REFERENCES users(id),seen_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_message_reactions(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,message_id INTEGER NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),emoji TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(kind,chat_id,message_id,user_id));
CREATE INDEX IF NOT EXISTS wm_message_reactions_chat ON wm_message_reactions(kind,chat_id,message_id);
CREATE TABLE IF NOT EXISTS wm_message_hides(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,message_id INTEGER NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(kind,chat_id,user_id,message_id));
CREATE TABLE IF NOT EXISTS wm_chat_private_pins(kind TEXT NOT NULL CHECK(kind IN ('private','group')),chat_id TEXT NOT NULL,message_id INTEGER NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(kind,chat_id,user_id,message_id));
CREATE TABLE IF NOT EXISTS wm_group_admins(group_id TEXT NOT NULL REFERENCES wm_groups(id),user_id TEXT NOT NULL REFERENCES users(id),added_by TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(group_id,user_id));
CREATE TABLE IF NOT EXISTS wm_message_mentions(group_id TEXT NOT NULL REFERENCES wm_groups(id),message_id INTEGER NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),actor_id TEXT NOT NULL REFERENCES users(id),everyone INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,seen_at INTEGER,PRIMARY KEY(group_id,message_id,user_id));
CREATE INDEX IF NOT EXISTS wm_message_mentions_user ON wm_message_mentions(user_id,seen_at,created_at);

CREATE UNIQUE INDEX IF NOT EXISTS wm_groups_invite_code ON wm_groups(invite_code);
CREATE TABLE IF NOT EXISTS wm_admin_deal_limits(user_id TEXT PRIMARY KEY REFERENCES users(id),max_amount INTEGER,updated_by TEXT NOT NULL REFERENCES users(id),updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_post_signals(post_id TEXT NOT NULL REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(post_id,user_id,kind));
CREATE INDEX IF NOT EXISTS wm_post_signals_user ON wm_post_signals(user_id,created_at);
CREATE TABLE IF NOT EXISTS wm_post_interest(post_id TEXT PRIMARY KEY REFERENCES wm_posts(id),score INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);
