-- Free Fire ID type: Male or Female (optional, chosen when posting). Used to show chosen IDs first in the feed.
-- Additive only: one new nullable column. Existing posts stay without an ID type.
ALTER TABLE wm_posts ADD COLUMN id_gender TEXT;
