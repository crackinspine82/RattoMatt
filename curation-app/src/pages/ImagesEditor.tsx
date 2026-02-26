import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getItem,
  getStructure,
  getChapterImages,
  uploadChapterImage,
  replaceChapterImage,
  updateChapterImageNodes,
  deleteChapterImage,
  getUploadUrl,
  type CurationItem,
  type DraftNode,
  type ChapterImage,
} from '../api';
import { buildNodesTree } from '../components/NotesTreeSidebar';
import { flattenTree } from '../structureUtils';

const NODE_INDENT = 16;

/** Derive slug from filename: no extension, special chars → underscore, max 255. */
function slugFromFilename(filename: string): string {
  const base = filename.replace(/\.[^/.]+$/, '').trim() || 'image';
  const slug = base
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
    .slice(0, 255);
  return slug || 'image';
}

export default function ImagesEditor() {
  const { itemId } = useParams<{ itemId: string }>();
  const [item, setItem] = useState<CurationItem | null>(null);
  const [images, setImages] = useState<ChapterImage[]>([]);
  const [nodes, setNodes] = useState<DraftNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  /** While uploading: { current, total }; after done: undefined. */
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  /** After a batch: { uploaded, skipped }; cleared on next selection or upload. */
  const [uploadResult, setUploadResult] = useState<{ uploaded: number; skipped: number } | null>(null);
  const [nodePickerImageId, setNodePickerImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** While node picker is open, working copy of node_ids for the image being edited. */
  const [editingNodeIds, setEditingNodeIds] = useState<string[]>([]);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const nodePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!itemId) return;
    Promise.all([getItem(itemId), getChapterImages(itemId), getStructure(itemId)])
      .then(([i, data, nodesData]) => {
        setItem(i);
        setImages(data.images ?? []);
        setNodes(nodesData ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [itemId]);

  const flatNodes = useMemo(() => flattenTree(buildNodesTree(nodes)), [nodes]);

  useEffect(() => {
    if (!nodePickerImageId) return;
    function handleClickOutside(e: MouseEvent) {
      if (nodePickerRef.current && !nodePickerRef.current.contains(e.target as Node)) setNodePickerImageId(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [nodePickerImageId]);

  async function handleUpload() {
    if (!itemId || uploadFiles.length === 0) return;
    setError('');
    setUploadResult(null);
    const existingSlugs = new Set(images.map((img) => img.slug));
    type Entry = { file: File; slug: string };
    const entries: Entry[] = [];
    const seenSlugs = new Set<string>();
    for (const file of uploadFiles) {
      const slug = slugFromFilename(file.name);
      if (existingSlugs.has(slug) || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);
      entries.push({ file, slug });
    }
    let skipped = uploadFiles.length - entries.length;
    if (entries.length === 0) {
      setError(skipped > 0 ? `All ${uploadFiles.length} file(s) skipped (duplicate slug). Use unique filenames per chapter.` : 'No files to upload.');
      return;
    }
    setUploading(true);
    setUploadProgress({ current: 0, total: entries.length });
    let uploaded = 0;
    let uploadError = '';
    try {
      for (let i = 0; i < entries.length; i++) {
        setUploadProgress({ current: i + 1, total: entries.length });
        try {
          const created = await uploadChapterImage(itemId, entries[i].file, entries[i].slug);
          setImages((prev) => [...prev, created]);
          uploaded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          if (msg.toLowerCase().includes('slug') && (msg.includes('already') || msg.includes('duplicate'))) {
            skipped++;
          } else {
            uploadError = msg;
            break;
          }
        }
      }
      setUploadResult({ uploaded, skipped: skipped });
      if (uploadError) setError(uploadError);
      setUploadFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleReplace(imageId: string, file: File) {
    setReplacingId(imageId);
    setError('');
    try {
      const updated = await replaceChapterImage(imageId, file);
      setImages((prev) => prev.map((img) => (img.id === imageId ? updated : img)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replace failed');
    } finally {
      setReplacingId(null);
    }
  }

  async function handleUpdateNodes(imageId: string, node_ids: string[]) {
    setError('');
    try {
      const updated = await updateChapterImageNodes(imageId, node_ids);
      setImages((prev) => prev.map((img) => (img.id === imageId ? updated : img)));
      setNodePickerImageId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  function openNodePicker(img: ChapterImage) {
    setNodePickerImageId(img.id);
    setEditingNodeIds([...img.node_ids]);
  }

  function toggleEditingNode(nodeId: string) {
    setEditingNodeIds((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    );
  }

  async function handleDelete(imageId: string) {
    setError('');
    try {
      await deleteChapterImage(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  if (!itemId) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--text-muted)' }}>Missing item.</p>
        <Link to="/" style={{ color: 'var(--link)', fontSize: 14 }}>Back to list</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, color: 'var(--text)' }}>
      <header style={{ marginBottom: 24 }}>
        <Link to="/" style={{ color: 'var(--link)', fontSize: 14, marginBottom: 8, display: 'inline-block' }}>
          ← Back to list
        </Link>
        <h1 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 600 }}>
          Chapter images – {item?.chapter_title ?? '…'}
        </h1>
        <p style={{ margin: 4, fontSize: 13, color: 'var(--text-muted)' }}>
          Manage images and map them to syllabus nodes for picture study and visual scenario questions.
        </p>
      </header>

      {error && (
        <div style={{ padding: 12, marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--danger)', borderRadius: 8, color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <section style={{ marginBottom: 32, padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>Upload images</h2>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
          Select one or more images. Slug is set from the filename (no extension); duplicate filenames in the chapter are skipped.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Images</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setUploadFiles(files);
                setUploadResult(null);
              }}
              style={{ fontSize: 14 }}
            />
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || uploadFiles.length === 0}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 600,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--bg)',
              color: 'var(--text)',
              cursor: uploading || uploadFiles.length === 0 ? 'not-allowed' : 'pointer',
              opacity: uploading || uploadFiles.length === 0 ? 0.7 : 1,
            }}
          >
            {uploading ? (uploadProgress ? `Uploading ${uploadProgress.current}/${uploadProgress.total}…` : 'Uploading…') : 'Upload'}
          </button>
        </div>
        {uploadResult !== null && (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {uploadResult.uploaded} uploaded{uploadResult.skipped > 0 ? `, ${uploadResult.skipped} skipped (duplicate slug)` : ''}.
          </p>
        )}
      </section>

      <section>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Images ({images.length})</h2>
        {images.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', background: 'var(--surface)', borderRadius: 8, border: '1px dashed var(--border)' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>No images uploaded yet</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)', maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
              Upload an image below and assign syllabus nodes to use it for picture study and visual scenario questions.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {images.map((img) => (
              <div
                key={img.id}
                style={{
                  padding: 16,
                  background: 'var(--surface)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr',
                  gap: 16,
                  alignItems: 'start',
                }}
              >
                <div style={{ aspectRatio: '1', background: 'var(--bg)', borderRadius: 6, overflow: 'hidden' }}>
                  <img
                    src={getUploadUrl(img.url)}
                    alt={img.slug}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.background = 'var(--surface)';
                      (e.target as HTMLImageElement).src = '';
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Slug</span>
                    <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 14 }}>{img.slug}</span>
                    {img.slug_locked && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>(locked)</span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }} ref={nodePickerImageId === img.id ? nodePickerRef : null}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Assigned nodes</span>
                    <button
                      type="button"
                      onClick={() => (nodePickerImageId === img.id ? setNodePickerImageId(null) : openNodePicker(img))}
                      style={{
                        marginLeft: 8,
                        padding: '4px 10px',
                        fontSize: 12,
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        background: 'var(--bg)',
                        color: 'var(--link)',
                        cursor: 'pointer',
                      }}
                    >
                      {img.node_ids.length ? `Edit (${img.node_ids.length})` : 'Assign nodes'}
                    </button>
                    {img.node_ids.length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                        {img.node_ids
                          .map((id) => flatNodes.find((n) => n.id === id)?.title ?? id.slice(0, 8))
                          .join(', ')}
                      </div>
                    )}
                    {nodePickerImageId === img.id && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: '100%',
                          marginTop: 4,
                          maxHeight: 280,
                          overflowY: 'auto',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          boxShadow: 'var(--shadow)',
                          zIndex: 50,
                          padding: 8,
                          minWidth: 260,
                        }}
                      >
                        {flatNodes.map((n) => (
                          <label
                            key={n.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '6px 8px',
                              cursor: 'pointer',
                              paddingLeft: 8 + (n.depth ?? 0) * NODE_INDENT,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={editingNodeIds.includes(n.id)}
                              onChange={() => toggleEditingNode(n.id)}
                            />
                            <span style={{ fontSize: 13 }}>{n.title || '(Untitled)'}</span>
                          </label>
                        ))}
                        {flatNodes.length === 0 && (
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No nodes. Save structure first.</p>
                        )}
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                          <button
                            type="button"
                            onClick={() => handleUpdateNodes(img.id, editingNodeIds)}
                            style={{
                              padding: '6px 12px',
                              fontSize: 12,
                              fontWeight: 600,
                              border: '1px solid var(--border)',
                              borderRadius: 4,
                              background: 'var(--bg)',
                              cursor: 'pointer',
                            }}
                          >
                            Save nodes
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <label
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        background: 'var(--bg)',
                        cursor: replacingId === img.id ? 'wait' : 'pointer',
                      }}
                    >
                      {replacingId === img.id ? 'Replacing…' : 'Replace image'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        style={{ display: 'none' }}
                        disabled={!!replacingId}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleReplace(img.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {deleteConfirmId === img.id ? (
                      <>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Delete this image?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(img.id)}
                          style={{
                            padding: '4px 10px',
                            fontSize: 12,
                            background: 'var(--danger)',
                            color: 'white',
                            border: 0,
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          style={{
                            padding: '4px 10px',
                            fontSize: 12,
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            background: 'var(--bg)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(img.id)}
                        style={{
                          padding: '6px 12px',
                          fontSize: 12,
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          background: 'var(--bg)',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
