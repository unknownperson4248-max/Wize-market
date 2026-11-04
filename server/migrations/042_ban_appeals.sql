-- Appeals for permanent bans: the member writes why, the Owner accepts (ban removed) or keeps the ban with a note.
-- Additive only: three new nullable columns. appealed: 0 = none, 1 = waiting for the Owner, 2 = ban kept.
ALTER TABLE wm_suspensions ADD COLUMN appeal_text TEXT;
ALTER TABLE wm_suspensions ADD COLUMN appeal_at INTEGER;
ALTER TABLE wm_suspensions ADD COLUMN appeal_note TEXT;
