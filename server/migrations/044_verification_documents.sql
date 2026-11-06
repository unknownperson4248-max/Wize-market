-- Verification documents: the member chooses the document (NID, passport, driving licence, birth certificate, student ID)
-- and takes live photos; NID and driving licence need the front and the back.
-- Additive only: two new columns. Older applications count as NID with one photo.
ALTER TABLE wm_verification_requests ADD COLUMN doc_type TEXT NOT NULL DEFAULT 'nid';
ALTER TABLE wm_verification_requests ADD COLUMN back_document_id TEXT;
