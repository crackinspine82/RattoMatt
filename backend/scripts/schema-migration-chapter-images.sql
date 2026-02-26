-- Run once: npm run migration:chapter-images
-- Chapter-scoped images for picture study / visual scenario: one list per chapter, slug + node mapping.
-- Slug is locked after first save (slug_locked = true).

CREATE TABLE IF NOT EXISTS curation_chapter_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  filename TEXT,
  slug TEXT NOT NULL,
  slug_locked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chapter_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_curation_chapter_images_chapter ON curation_chapter_images(chapter_id);

CREATE TABLE IF NOT EXISTS curation_chapter_image_nodes (
  image_id UUID NOT NULL REFERENCES curation_chapter_images(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES draft_syllabus_nodes(id) ON DELETE CASCADE,
  PRIMARY KEY (image_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_curation_chapter_image_nodes_image ON curation_chapter_image_nodes(image_id);
