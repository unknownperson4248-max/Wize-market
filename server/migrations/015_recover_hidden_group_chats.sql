-- Recover legacy Hide group entries in Archived chats without deleting messages.
INSERT INTO wm_chat_preferences(user_id,kind,chat_id,archived,updated_at)
 SELECT user_id,'group',chat_id,1,created_at FROM wm_chat_hides WHERE kind='group'
 ON CONFLICT(user_id,kind,chat_id) DO UPDATE SET archived=1,updated_at=excluded.updated_at;
DELETE FROM wm_chat_hides WHERE kind='group';
-- Existing blocked personal conversations remain visible and readable in All chat.
UPDATE wm_chat_preferences SET archived=0 WHERE kind='private' AND EXISTS(
 SELECT 1 FROM wm_threads t JOIN wm_user_blocks b ON b.user_id=wm_chat_preferences.user_id
 AND b.target_id=CASE WHEN t.buyer_id=b.user_id THEN t.seller_id ELSE t.buyer_id END
 WHERE t.id=wm_chat_preferences.chat_id AND t.is_deal=0 AND (t.buyer_id=b.user_id OR t.seller_id=b.user_id));
DELETE FROM wm_chat_hides WHERE kind='private' AND EXISTS(
 SELECT 1 FROM wm_threads t JOIN wm_user_blocks b ON b.user_id=wm_chat_hides.user_id
 AND b.target_id=CASE WHEN t.buyer_id=b.user_id THEN t.seller_id ELSE t.buyer_id END
 WHERE t.id=wm_chat_hides.chat_id AND t.is_deal=0 AND (t.buyer_id=b.user_id OR t.seller_id=b.user_id));
