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
