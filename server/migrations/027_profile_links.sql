-- Profile links under the bio (only the Owner and trusted Admins can add them).
-- Additive only: existing profiles keep their data and start with no links.
ALTER TABLE wm_profile_details ADD COLUMN links TEXT NOT NULL DEFAULT '[]';
