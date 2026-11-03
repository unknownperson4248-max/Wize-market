-- Group invite links (/j/<code>, can be turned off or reset) and the order of price ranges.
-- Additive only: three new columns with safe defaults and one index.
ALTER TABLE wm_groups ADD COLUMN invite_code TEXT;
ALTER TABLE wm_groups ADD COLUMN invite_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE wm_group_ranges ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS wm_groups_invite_code ON wm_groups(invite_code);
