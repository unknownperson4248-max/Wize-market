-- Message permissions: the group admin can let only admins send messages. Additive only: one new column, default 0 (everyone can send).
ALTER TABLE wm_groups ADD COLUMN admins_only INTEGER NOT NULL DEFAULT 0;
