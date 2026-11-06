-- Answers to the Owner's custom verification questions (Admin Panel → Texts & templates).
-- Additive only: existing applications keep their data and get an empty answer list.
ALTER TABLE wm_verification_requests ADD COLUMN answers TEXT NOT NULL DEFAULT '[]';
