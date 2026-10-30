CREATE TABLE IF NOT EXISTS wm_roles(user_id TEXT PRIMARY KEY REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('owner','trusted')));
CREATE TABLE IF NOT EXISTS wm_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wm_groups(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,price INTEGER,logo_id TEXT,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_group_members(group_id TEXT NOT NULL REFERENCES wm_groups(id),user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(group_id,user_id));
CREATE TABLE IF NOT EXISTS wm_posts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),group_id TEXT REFERENCES wm_groups(id),range_id TEXT,title TEXT NOT NULL,details TEXT NOT NULL,price INTEGER,kind TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),media TEXT NOT NULL DEFAULT '[]',created_at INTEGER NOT NULL,deleted_at INTEGER,updated_at INTEGER,version INTEGER NOT NULL DEFAULT 0,game_category TEXT NOT NULL DEFAULT 'free-fire',price_format TEXT NOT NULL DEFAULT 'full');
CREATE TABLE IF NOT EXISTS wm_uploads(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),type TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_threads(id TEXT PRIMARY KEY,buyer_id TEXT NOT NULL REFERENCES users(id),seller_id TEXT NOT NULL REFERENCES users(id),post_id TEXT REFERENCES wm_posts(id),pair_key TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'requested',created_at INTEGER NOT NULL,is_deal INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS wm_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,thread_id TEXT NOT NULL REFERENCES wm_threads(id),user_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created_at INTEGER NOT NULL,deleted_at INTEGER,archived_at INTEGER);
CREATE TABLE IF NOT EXISTS wm_group_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,group_id TEXT NOT NULL REFERENCES wm_groups(id),user_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,created_at INTEGER NOT NULL,deleted_at INTEGER,archived_at INTEGER);
CREATE TABLE IF NOT EXISTS wm_follows(user_id TEXT NOT NULL REFERENCES users(id),target_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,target_id),CHECK(user_id!=target_id));
CREATE TABLE IF NOT EXISTS wm_deals(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES wm_threads(id),buyer_id TEXT NOT NULL REFERENCES users(id),seller_id TEXT NOT NULL REFERENCES users(id),admin_id TEXT REFERENCES users(id),price INTEGER NOT NULL,fee INTEGER NOT NULL DEFAULT 0,buyer_ok INTEGER NOT NULL DEFAULT 0,seller_ok INTEGER NOT NULL DEFAULT 0,buyer_done INTEGER NOT NULL DEFAULT 0,seller_done INTEGER NOT NULL DEFAULT 0,post_id TEXT REFERENCES wm_posts(id),mode TEXT NOT NULL DEFAULT 'mediated',account_name TEXT NOT NULL DEFAULT '',admin_done INTEGER NOT NULL DEFAULT 0,completed_at INTEGER,direct_completion_started_at INTEGER,completion_note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'proposed',version INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
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

CREATE TABLE IF NOT EXISTS wm_group_ranges(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES wm_groups(id),label TEXT NOT NULL,min_price INTEGER NOT NULL,max_price INTEGER,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_group_ranges_group ON wm_group_ranges(group_id,min_price);
CREATE TABLE IF NOT EXISTS wm_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),username TEXT UNIQUE NOT NULL COLLATE NOCASE,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wm_suspensions(user_id TEXT PRIMARY KEY REFERENCES users(id),until_at INTEGER NOT NULL,reason TEXT NOT NULL,post_id TEXT,appealed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS wm_safety_events(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),decision TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_safety_post ON wm_safety_events(post_id,created_at);
CREATE TABLE IF NOT EXISTS wm_admin_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS wm_profile_details(user_id TEXT PRIMARY KEY REFERENCES users(id),display_name TEXT,bio TEXT NOT NULL DEFAULT '',picture_id TEXT,updated_at INTEGER NOT NULL,cover_id TEXT);
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
CREATE TABLE IF NOT EXISTS wm_reports(id TEXT PRIMARY KEY,post_id TEXT REFERENCES wm_posts(id),user_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,details TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),created_at INTEGER NOT NULL,resolved_by TEXT REFERENCES users(id),resolved_at INTEGER);
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
