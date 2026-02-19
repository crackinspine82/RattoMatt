-- Run once: npm run migration:item-images
-- Adds curation_item_images for chapter-scoped image picker (upload + choose from chapter).

CREATE TABLE IF NOT EXISTS curation_item_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES curation_items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  filename TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_curation_item_images_item ON curation_item_images(item_id);
