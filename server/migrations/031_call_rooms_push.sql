-- Group and deal calls: one live call room per chat. Phones connect to each other (mesh WebRTC);
-- the offers and answers wait here until the other phone picks them up. Additive only.
CREATE TABLE IF NOT EXISTS wm_call_rooms(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('group','deal')),chat_id TEXT NOT NULL,video INTEGER NOT NULL DEFAULT 0,started_by TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL DEFAULT 'live' CHECK(status IN ('live','ended')),created_at INTEGER NOT NULL,answered_at INTEGER,ended_at INTEGER);
CREATE INDEX IF NOT EXISTS wm_call_rooms_chat ON wm_call_rooms(kind,chat_id,status);
CREATE INDEX IF NOT EXISTS wm_call_rooms_live ON wm_call_rooms(status,created_at);
CREATE INDEX IF NOT EXISTS wm_call_rooms_starter ON wm_call_rooms(started_by,created_at);
CREATE TABLE IF NOT EXISTS wm_call_room_members(room_id TEXT NOT NULL REFERENCES wm_call_rooms(id),user_id TEXT NOT NULL REFERENCES users(id),joined_at INTEGER NOT NULL,seen_at INTEGER NOT NULL,left_at INTEGER,PRIMARY KEY(room_id,user_id));
CREATE INDEX IF NOT EXISTS wm_call_room_members_user ON wm_call_room_members(user_id,left_at);
CREATE TABLE IF NOT EXISTS wm_call_signals(id INTEGER PRIMARY KEY AUTOINCREMENT,room_id TEXT NOT NULL REFERENCES wm_call_rooms(id),from_id TEXT NOT NULL REFERENCES users(id),to_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('offer','answer')),sdp TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_call_signals_to ON wm_call_signals(room_id,to_id,id);
-- Call alerts when Wize X is closed (Web Push). The push carries no data: the phone asks wm_push_events what to show.
CREATE TABLE IF NOT EXISTS wm_push_subscriptions(endpoint TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),p256dh TEXT NOT NULL DEFAULT '',auth TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,last_ok_at INTEGER,failures INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS wm_push_subscriptions_user ON wm_push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS wm_push_events(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('call','room','missed')),ref_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,url TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wm_push_events_user ON wm_push_events(user_id,expires_at);
CREATE INDEX IF NOT EXISTS wm_push_events_ref ON wm_push_events(ref_id);
