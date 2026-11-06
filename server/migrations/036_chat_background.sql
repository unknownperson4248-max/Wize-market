-- Chat background photo chosen in Customize. Additive only: one new nullable column.
ALTER TABLE wm_chat_themes ADD COLUMN background_id TEXT;
