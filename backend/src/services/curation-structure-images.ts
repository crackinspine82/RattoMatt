/**
 * Shared logic for structure-images: slug + published syllabus_node_ids per chapter image.
 * Used by GET /curation/items/:id/structure-images and GET /admin/curation/items/:id/structure-images.
 */

import type { Pool } from 'pg';

export interface StructureImageSlot {
  slug: string;
  node_ids: string[];
}

export async function getStructureImagesForItem(
  pool: Pool,
  itemId: string
): Promise<{ structure_images: StructureImageSlot[] } | null> {
  const itemRes = await pool.query<{ chapter_id: string }>(
    'SELECT chapter_id FROM curation_items WHERE id = $1',
    [itemId]
  );
  if (itemRes.rows.length === 0) return null;
  const chapterId = itemRes.rows[0].chapter_id;
  const imagesRes = await pool.query<{ id: string; slug: string }>(
    'SELECT id, slug FROM curation_chapter_images WHERE chapter_id = $1 ORDER BY created_at ASC',
    [chapterId]
  );
  const imageIds = imagesRes.rows.map((r) => r.id);
  if (imageIds.length === 0) return { structure_images: [] };
  const nodeRes = await pool.query<{ image_id: string; published_id: string }>(
    `SELECT n.image_id, d.published_syllabus_node_id AS published_id
     FROM curation_chapter_image_nodes n
     JOIN draft_syllabus_nodes d ON d.id = n.node_id AND d.chapter_id = $1
     WHERE d.published_syllabus_node_id IS NOT NULL AND n.image_id = ANY($2::uuid[])`,
    [chapterId, imageIds]
  );
  const nodesByImage: Record<string, string[]> = {};
  for (const r of nodeRes.rows) {
    if (!nodesByImage[r.image_id]) nodesByImage[r.image_id] = [];
    nodesByImage[r.image_id].push(r.published_id);
  }
  const structure_images = imagesRes.rows.map((r) => ({
    slug: r.slug,
    node_ids: nodesByImage[r.id] ?? [],
  }));
  return { structure_images };
}
