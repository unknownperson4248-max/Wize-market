-- Verification applications also carry the applicant's WhatsApp number and the live location they shared when applying.
-- Owner-only data; existing applications keep their values (empty WhatsApp, no location).
ALTER TABLE wm_verification_requests ADD COLUMN whatsapp TEXT NOT NULL DEFAULT '';
ALTER TABLE wm_verification_requests ADD COLUMN location_lat REAL;
ALTER TABLE wm_verification_requests ADD COLUMN location_lng REAL;
ALTER TABLE wm_verification_requests ADD COLUMN location_accuracy REAL;
ALTER TABLE wm_verification_requests ADD COLUMN location_at INTEGER;
