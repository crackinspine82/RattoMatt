import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { getRevisionNotes, saveRevisionNotes, setStatus, type DraftNode, type RevisionNoteBlock } from '../api';
import { RichTextBlockEditor } from '../components/RichTextEditor';
import { buildNodesTree, NotesTreeSidebar } from '../components/NotesTreeSidebar';
import { flattenTree } from '../structureUtils';
import { SortableBlockRow } from '../components/SortableBlockRow';

const UNDO_MAX = 5;
type UndoSnapshot = { blocks: RevisionNoteBlock[]; selectedNodeId: string | null };

function renumberBlocks(blocks: RevisionNoteBlock[]): RevisionNoteBlock[] {
  const byNode = blocks.reduce<Record<string, RevisionNoteBlock[]>>((acc, b) => {
    const id = b.syllabus_node_id ?? '';
    if (!id) return acc;
    if (!acc[id]) acc[id] = [];
    acc[id].push(b);
    return acc;
  }, {});
  const result: RevisionNoteBlock[] = [];
  for (const list of Object.values(byNode)) {
    list.sort((a, b) => a.sequence_number - b.sequence_number);
    list.forEach((b, i) => result.push({ ...b, sequence_number: i + 1 }));
  }
  return result;
}

/** Revision Notes editor: tree (read-only) + blocks. Load/save via revision_notes item. */
export default function RevisionNotesEditor() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<DraftNode[]>([]);
  const [blocks, setBlocks] = useState<RevisionNoteBlock[]>([]);
  const [orphanedBlocks, setOrphanedBlocks] = useState<RevisionNoteBlock[]>([]);
  const [noPublishedStructure, setNoPublishedStructure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const blocksRef = useRef<RevisionNoteBlock[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  const SIDEBAR_WIDTH_KEY = 'curation-app-sidebar-width';
  const MIN_SIDEBAR = 200;
  const MAX_SIDEBAR = 600;
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return 260;
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const n = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(n) && n >= MIN_SIDEBAR && n <= MAX_SIDEBAR ? n : 260;
  });
  const lastWidthRef = useRef(sidebarWidth);

  const PREVIEW_WIDTH_KEY = 'curation-app-revision-preview-width';
  const MIN_PREVIEW = 280;
  const MAX_PREVIEW = 800;
  const [previewWidth, setPreviewWidth] = useState(() => {
    if (typeof window === 'undefined') return 400;
    const stored = localStorage.getItem(PREVIEW_WIDTH_KEY);
    const n = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(n) && n >= MIN_PREVIEW && n <= MAX_PREVIEW ? n : 400;
  });
  const lastPreviewWidthRef = useRef(previewWidth);
  const previewRef = useRef<HTMLDivElement>(null);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    lastWidthRef.current = startWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      const next = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startWidth + delta));
      lastWidthRef.current = next;
      setSidebarWidth(next);
    }
    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(lastWidthRef.current));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handlePreviewResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = previewWidth;
    lastPreviewWidthRef.current = startW;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX;
      const next = Math.min(MAX_PREVIEW, Math.max(MIN_PREVIEW, startW + delta));
      lastPreviewWidthRef.current = next;
      setPreviewWidth(next);
    }
    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      localStorage.setItem(PREVIEW_WIDTH_KEY, String(lastPreviewWidthRef.current));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    if (!itemId) return;
    getRevisionNotes(itemId)
      .then((data) => {
        setNodes(data.nodes);
        setBlocks(data.blocks);
        setOrphanedBlocks(data.orphaned_blocks ?? []);
        setNoPublishedStructure(data.no_published_structure ?? false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [itemId]);

  // Keep ref in sync so pushUndo() in event handlers always sees latest blocks
  blocksRef.current = blocks;

  function pushUndo(snapshot?: UndoSnapshot) {
    const toPush: UndoSnapshot = snapshot ?? {
      blocks: JSON.parse(JSON.stringify(blocksRef.current)) as RevisionNoteBlock[],
      selectedNodeId,
    };
    setUndoStack((prev) => {
      const next = prev.length >= UNDO_MAX ? prev.slice(1) : prev;
      return [...next, toPush];
    });
  }

  function handleUndo() {
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot) return;
    const restoredBlocks = JSON.parse(JSON.stringify(snapshot.blocks)) as RevisionNoteBlock[];
    setBlocks(restoredBlocks);
    setSelectedNodeId(snapshot.selectedNodeId);
    setUndoStack((prev) => prev.slice(0, -1));
  }

  async function handleSave() {
    if (!itemId) return;
    setSaving(true);
    setError('');
    try {
      const payload = blocks
        .filter((b) => b.syllabus_node_id != null)
        .map((b) => ({
          syllabus_node_id: b.syllabus_node_id!,
          sequence_number: b.sequence_number,
          content_html: b.content_html,
        }));
      const res = await saveRevisionNotes(itemId, payload);
      setBlocks(res.blocks);
      setOrphanedBlocks(res.orphaned_blocks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleReadyToPublish() {
    if (!itemId) return;
    setSaving(true);
    setError('');
    try {
      await setStatus(itemId, 'ready_to_publish');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  if (!itemId) return null;

  const blocksByNode = useMemo(
    () =>
      blocks.reduce<Record<string, RevisionNoteBlock[]>>((acc, b) => {
        const id = b.syllabus_node_id ?? '';
        if (!id) return acc;
        if (!acc[id]) acc[id] = [];
        acc[id].push(b);
        return acc;
      }, {}),
    [blocks]
  );

  const tree = useMemo(() => buildNodesTree(nodes), [nodes]);
  const flatOrder = useMemo(() => flattenTree(tree), [tree]);

  const blocksByNodeForSidebar = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(blocksByNode).map(([id, list]) => [id, { count: list.length }])
      ) as Record<string, { count: number }>,
    [blocksByNode]
  );

  useEffect(() => {
    if (!selectedNodeId || !contentRef.current) return;
    const el = contentRef.current.querySelector(`[data-node-id="${selectedNodeId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId || !previewRef.current) return;
    const el = previewRef.current.querySelector(`[data-preview-node-id="${selectedNodeId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedNodeId]);

  function handleBlockContentChange(blockId: string, html: string) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, content_html: html } : b))
    );
  }

  function handleDeleteBlock(blockId: string) {
    pushUndo();
    setBlocks((prev) => renumberBlocks(prev.filter((b) => b.id !== blockId)));
  }

  function handleAddBlock(nodeId: string) {
    pushUndo();
    const newBlock: RevisionNoteBlock = {
      id: `temp-${Date.now()}`,
      syllabus_node_id: nodeId,
      sequence_number: 0,
      content_html: '',
    };
    setBlocks((prev) => renumberBlocks([...prev, newBlock]));
    setSelectedNodeId(nodeId);
  }

  function handleMoveBlock(blockId: string, targetNodeId: string) {
    pushUndo();
    setBlocks((prev) => {
      const updated = prev.map((b) =>
        b.id === blockId ? { ...b, syllabus_node_id: targetNodeId } : b
      );
      return renumberBlocks(updated);
    });
    setSelectedNodeId(targetNodeId);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (blocks.some((b) => b.id === id)) setActiveBlockId(id);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveBlockId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = String(over.id);

    if (overId.startsWith('sidebar-')) {
      const targetNodeId = overId.slice('sidebar-'.length);
      handleMoveBlock(activeId, targetNodeId);
      return;
    }

    pushUndo();
    const sourceBlock = blocks.find((b) => b.id === activeId);
    const targetBlock = blocks.find((b) => b.id === overId);
    if (!sourceBlock || !targetBlock || sourceBlock.syllabus_node_id == null || targetBlock.syllabus_node_id == null) return;

    const sourceNodeId = sourceBlock.syllabus_node_id;
    const targetNodeId = targetBlock.syllabus_node_id;

    const sourceList = [...(blocksByNode[sourceNodeId] ?? [])].sort(
      (a, b) => a.sequence_number - b.sequence_number
    );
    const targetList = [...(blocksByNode[targetNodeId] ?? [])].sort(
      (a, b) => a.sequence_number - b.sequence_number
    );
    const oldIndex = sourceList.findIndex((b) => b.id === activeId);
    const newIndex = targetList.findIndex((b) => b.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    if (sourceNodeId === targetNodeId) {
      const reordered = arrayMove(sourceList, oldIndex, newIndex);
      const renumbered = reordered.map((b, i) => ({ ...b, sequence_number: i + 1 }));
      const otherBlocks = blocks.filter((b) => b.syllabus_node_id !== sourceNodeId);
      setBlocks([...otherBlocks, ...renumbered]);
    } else {
      const withoutSource = blocks.filter((b) => b.id !== activeId);
      const moved = { ...sourceBlock, syllabus_node_id: targetNodeId };
      const newTargetList = [...targetList];
      newTargetList.splice(newIndex, 0, moved);
      const renumberedTarget = newTargetList.map((b, i) => ({
        ...b,
        syllabus_node_id: targetNodeId,
        sequence_number: i + 1,
      }));
      const otherBlocks = withoutSource.filter((b) => b.syllabus_node_id !== targetNodeId);
      setBlocks(renumberBlocks([...otherBlocks, ...renumberedTarget]));
      setSelectedNodeId(targetNodeId);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', color: 'var(--text)' }}>
      <header style={{ flexShrink: 0, padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--header-bg)' }}>
        <Link to="/" style={{ color: 'var(--link)', textDecoration: 'none', fontSize: 14 }}>← Back to list</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Revision Notes</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo last action (up to 5)"
              style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, cursor: undoStack.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              Undo {undoStack.length > 0 && `(${undoStack.length})`}
            </button>
            <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: '#2563eb', color: '#fff', border: 0, borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={handleReadyToPublish} disabled={saving} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: '#16a34a', color: '#fff', border: 0, borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer' }}>
              Mark Ready to Publish
            </button>
          </div>
        </div>
      </header>
      {error && <p style={{ color: 'var(--danger)', marginBottom: 16, padding: '0 24px' }}>{error}</p>}
      {loading ? (
        <p style={{ padding: 24 }}>Loading…</p>
      ) : noPublishedStructure ? (
        <div style={{ padding: 24, maxWidth: 560 }}>
          <p style={{ color: 'var(--text)', fontSize: 16, marginBottom: 12 }}>
            <strong>Publish the Structure item for this chapter first.</strong>
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Revision notes are keyed to the <em>published</em> syllabus tree. Open the Structure item for this chapter, edit the draft structure and full extract, then mark it ready and run the publish script. After that, you can generate and edit revision notes here.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveBlockId(null)}
        >
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <NotesTreeSidebar
              width={sidebarWidth}
              tree={tree}
              flatOrder={flatOrder}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              blocksByNode={blocksByNodeForSidebar}
            />
            <div
              role="separator"
              aria-label="Resize sidebar"
              onMouseDown={handleResizeStart}
              style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: 'var(--border)' }}
            />
            <div
              ref={contentRef}
              style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 24, background: 'var(--bg)' }}
            >
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
                {nodes.length} nodes (published), {blocks.length} revision note blocks
                {blocks.length > 0 && ` (${blocks.filter((b) => (b.content_html || '').trim().length > 0).length} with content)`}.
                Tree is read-only.
              </p>
              {orphanedBlocks.length > 0 && (
                <div style={{ marginBottom: 16, padding: 12, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                  <strong>Orphaned</strong> ({orphanedBlocks.length} block{orphanedBlocks.length !== 1 ? 's' : ''}): draft content whose node was removed from the published structure. They are not published; you can delete or re-assign after re-adding a node.
                </div>
              )}
              {blocks.length === 0 && nodes.length > 0 && (
                <div style={{ marginBottom: 16, padding: 12, background: 'var(--selected-bg)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
                  <strong>No revision note blocks for this chapter.</strong> Import generated revision notes: from <code>backend/</code> run{' '}
                  <code style={{ fontSize: 12 }}>npm run curation:import -- --notes-only ../scripts/study-notes-generate/out</code> (or point to the folder containing <code>study_notes_*.json</code>). Run this after syllabus import so blocks attach to the current structure.
                </div>
              )}
              <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 16, boxShadow: 'var(--shadow)' }}>
                {nodes.map((n) => {
                  const nodeBlocks = [...(blocksByNode[n.id] ?? [])].sort(
                    (a, b) => a.sequence_number - b.sequence_number
                  );
                  const isSelected = selectedNodeId === n.id;
                  return (
                    <div
                      key={n.id}
                      data-node-id={n.id}
                      style={{
                        marginBottom: 24,
                        paddingBottom: 16,
                        borderBottom: '1px solid var(--border)',
                        scrollMarginTop: 24,
                        ...(isSelected ? { background: 'var(--selected-bg)', marginLeft: -8, marginRight: -8, paddingLeft: 8, paddingRight: 8, borderRadius: 6 } : {}),
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600 }}>{n.title}</span>
                        <button
                          type="button"
                          onClick={() => handleAddBlock(n.id)}
                          style={{ fontSize: 13, padding: '4px 10px', border: '1px solid var(--link)', borderRadius: 4, background: 'var(--surface)', color: 'var(--link)', cursor: 'pointer' }}
                        >
                          + Add block
                        </button>
                      </div>
                      {nodeBlocks.length === 0 ? (
                        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>No revision notes</p>
                      ) : (
                        <SortableContext items={nodeBlocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                          {nodeBlocks.map((b) => (
                            <SortableBlockRow key={b.id} block={b}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <RichTextBlockEditor block={b} onContentChange={handleBlockContentChange} itemId={itemId ?? undefined} />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteBlock(b.id)}
                                title="Delete block"
                                style={{ flexShrink: 0, padding: '6px 10px', fontSize: 12, border: '1px solid var(--danger)', borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)', cursor: 'pointer', marginTop: 4 }}
                              >
                                Delete
                              </button>
                            </SortableBlockRow>
                          ))}
                        </SortableContext>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div
              role="separator"
              aria-label="Resize preview"
              onMouseDown={handlePreviewResizeStart}
              style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: 'var(--border)' }}
            />
            <div
              ref={previewRef}
              style={{
                width: previewWidth,
                flexShrink: 0,
                overflowY: 'auto',
                padding: 24,
                background: 'var(--surface)',
                borderLeft: '1px solid var(--border)',
              }}
            >
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Preview (as output)</p>
              <div className="revision-notes-preview">
                {flatOrder.map((n) => {
                  const nodeBlocks = [...(blocksByNode[n.id] ?? [])].sort(
                    (a, b) => a.sequence_number - b.sequence_number
                  );
                  return (
                    <section
                      key={n.id}
                      data-preview-node-id={n.id}
                      style={{ marginBottom: 24, scrollMarginTop: 24 }}
                    >
                      <h2 style={{ fontSize: '1.1em', fontWeight: 600, margin: '0 0 8px', color: 'var(--text)' }}>
                        {n.title}
                      </h2>
                      {nodeBlocks.length === 0 ? (
                        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>No revision notes</p>
                      ) : (
                        nodeBlocks.map((b) => (
                          <div
                            key={b.id}
                            className="revision-notes-preview__block"
                            dangerouslySetInnerHTML={{ __html: b.content_html || '' }}
                          />
                        ))
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
          <DragOverlay>
            {activeBlockId ? (() => {
              const block = blocks.find((b) => b.id === activeBlockId);
              if (!block) return null;
              const text = block.content_html.replace(/<[^>]+>/g, ' ').trim().slice(0, 60) || 'Block';
              return (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--surface)', color: 'var(--text)', padding: '8px 12px', borderRadius: 6, boxShadow: 'var(--shadow-sm)', cursor: 'grabbing', border: '1px solid var(--border)' }}>
                  <div style={{ flexShrink: 0, padding: '8px 4px', marginTop: 4, color: 'var(--text-muted)', fontSize: 16, lineHeight: 1 }}>⋮⋮</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{text}{text.length >= 60 ? '…' : ''}</div>
                  <div style={{ flexShrink: 0, padding: '6px 10px', fontSize: 12, border: '1px solid var(--danger)', borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)' }}>Delete</div>
                </div>
              );
            })() : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
