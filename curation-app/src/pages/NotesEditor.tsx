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
import { getNotes, saveNotes, saveStructure, setStatus, updateNodeTitle, type DraftNode, type DraftNoteBlock } from '../api';
import { RichTextBlockEditor } from '../components/RichTextEditor';
import { buildNodesTree, NotesTreeSidebar } from '../components/NotesTreeSidebar';
import { collectNodeAndDescendantIds, flattenTree, renumberStructureNodes } from '../structureUtils';
import { SortableBlockRow } from '../components/SortableBlockRow';

/** Renumber sequence_number per node so each node's blocks are 1, 2, 3, ... */
function renumberBlocks(blocks: DraftNoteBlock[]): DraftNoteBlock[] {
  const byNode = blocks.reduce<Record<string, DraftNoteBlock[]>>((acc, b) => {
    const id = b.draft_syllabus_node_id;
    if (!acc[id]) acc[id] = [];
    acc[id].push(b);
    return acc;
  }, {});
  const result: DraftNoteBlock[] = [];
  for (const list of Object.values(byNode)) {
    list.sort((a, b) => a.sequence_number - b.sequence_number);
    list.forEach((b, i) => result.push({ ...b, sequence_number: i + 1 }));
  }
  return result;
}

export default function NotesEditor() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<DraftNode[]>([]);
  const [blocks, setBlocks] = useState<DraftNoteBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingStructure, setSavingStructure] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!itemId) return;
    getNotes(itemId)
      .then((data) => {
        setNodes(data.nodes);
        setBlocks(data.blocks);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [itemId]);

  async function handleSave() {
    if (!itemId) return;
    setSaving(true);
    setError('');
    try {
      const payload = blocks.map((b) => ({
        draft_syllabus_node_id: b.draft_syllabus_node_id,
        sequence_number: b.sequence_number,
        content_html: b.content_html,
      }));
      const res = await saveNotes(itemId, payload);
      setBlocks(res.blocks);
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
      blocks.reduce<Record<string, DraftNoteBlock[]>>((acc, b) => {
        const id = b.draft_syllabus_node_id;
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

  function handleBlockContentChange(blockId: string, html: string) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, content_html: html } : b))
    );
  }

  function handleDeleteBlock(blockId: string) {
    setBlocks((prev) => renumberBlocks(prev.filter((b) => b.id !== blockId)));
  }

  function handleAddBlock(nodeId: string) {
    const newBlock: DraftNoteBlock = {
      id: `temp-${Date.now()}`,
      draft_syllabus_node_id: nodeId,
      sequence_number: 0,
      content_html: '',
    };
    setBlocks((prev) => renumberBlocks([...prev, newBlock]));
    setSelectedNodeId(nodeId);
  }

  function handleMoveBlock(blockId: string, targetNodeId: string) {
    setBlocks((prev) => {
      const updated = prev.map((b) =>
        b.id === blockId ? { ...b, draft_syllabus_node_id: targetNodeId } : b
      );
      return renumberBlocks(updated);
    });
    setSelectedNodeId(targetNodeId);
  }

  async function handleIndent(index: number) {
    if (!itemId || index <= 0) return;
    const node = flatOrder[index];
    const newParent = flatOrder[index - 1];
    const maxSeq = Math.max(
      0,
      ...nodes.filter((n) => n.parent_id === newParent.id).map((n) => n.sequence_number)
    );
    const updated = nodes.map((n) =>
      n.id === node.id ? { ...n, parent_id: newParent.id, sequence_number: maxSeq + 1 } : n
    );
    const renumbered = renumberStructureNodes(updated);
    setNodes(renumbered);
    setSavingStructure(true);
    setError('');
    try {
      const saved = await saveStructure(itemId, renumbered);
      setNodes(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save structure');
    } finally {
      setSavingStructure(false);
    }
  }

  async function handleOutdent(index: number) {
    if (!itemId) return;
    const node = flatOrder[index];
    if (node.parent_id == null) return;
    const parent = nodes.find((n) => n.id === node.parent_id);
    if (!parent) return;
    const updated = nodes.map((n) =>
      n.id === node.id
        ? { ...n, parent_id: parent.parent_id, sequence_number: parent.sequence_number + 1 }
        : n
    );
    const renumbered = renumberStructureNodes(updated);
    setNodes(renumbered);
    setSavingStructure(true);
    setError('');
    try {
      const saved = await saveStructure(itemId, renumbered);
      setNodes(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save structure');
    } finally {
      setSavingStructure(false);
    }
  }

  async function handleDeleteNode(nodeId: string) {
    if (!itemId) return;
    const idsToDelete = collectNodeAndDescendantIds(nodes, nodeId);
    const count = idsToDelete.size;
    if (!window.confirm(`Delete this node and ${count - 1} descendant(s)? All blocks in them will be removed.`)) return;
    const updatedNodes = renumberStructureNodes(nodes.filter((n) => !idsToDelete.has(n.id)));
    setBlocks((prev) => prev.filter((b) => !idsToDelete.has(b.draft_syllabus_node_id)));
    if (idsToDelete.has(selectedNodeId ?? '')) setSelectedNodeId(null);
    setNodes(updatedNodes);
    setSavingStructure(true);
    setError('');
    try {
      const saved = await saveStructure(itemId, updatedNodes);
      setNodes(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete node');
    } finally {
      setSavingStructure(false);
    }
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

    const sourceBlock = blocks.find((b) => b.id === activeId);
    const targetBlock = blocks.find((b) => b.id === overId);
    if (!sourceBlock || !targetBlock) return;

    const sourceNodeId = sourceBlock.draft_syllabus_node_id;
    const targetNodeId = targetBlock.draft_syllabus_node_id;

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
      const otherBlocks = blocks.filter((b) => b.draft_syllabus_node_id !== sourceNodeId);
      setBlocks([...otherBlocks, ...renumbered]);
    } else {
      const withoutSource = blocks.filter((b) => b.id !== activeId);
      const moved = { ...sourceBlock, draft_syllabus_node_id: targetNodeId };
      const newTargetList = [...targetList];
      newTargetList.splice(newIndex, 0, moved);
      const renumberedTarget = newTargetList.map((b, i) => ({
        ...b,
        draft_syllabus_node_id: targetNodeId,
        sequence_number: i + 1,
      }));
      const otherBlocks = withoutSource.filter((b) => b.draft_syllabus_node_id !== targetNodeId);
      setBlocks(renumberBlocks([...otherBlocks, ...renumberedTarget]));
      setSelectedNodeId(targetNodeId);
    }
  }

  function handleSectionTitleSave(nodeId: string, newTitle: string) {
    const trimmed = newTitle.trim();
    const fallback = nodes.find((n) => n.id === nodeId)?.title ?? '';
    const titleToSave = trimmed || fallback;
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, title: titleToSave } : n)));
    setEditingNodeId(null);
    if (!itemId || !titleToSave) return;
    setSavingTitle(true);
    updateNodeTitle(itemId, nodeId, titleToSave)
      .then((updatedNode) => {
        setNodes((prev) => prev.map((n) => (n.id === nodeId ? updatedNode : n)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to save section title'))
      .finally(() => setSavingTitle(false));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', color: 'var(--text)' }}>
      <header style={{ flexShrink: 0, padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--header-bg)' }}>
        <Link to="/" style={{ color: 'var(--link)', textDecoration: 'none', fontSize: 14 }}>← Back to list</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Structure {savingTitle && <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>(saving title…)</span>}{savingStructure && <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}> (saving structure…)</span>}</h1>
          <div style={{ display: 'flex', gap: 12 }}>
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
            onIndent={handleIndent}
            onOutdent={handleOutdent}
            onDeleteNode={handleDeleteNode}
            savingStructure={savingStructure}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            blocksByNode={blocksByNodeForSidebar}
          />
            <div
              role="separator"
              aria-label="Resize sidebar"
              onMouseDown={handleResizeStart}
              style={{
                width: 6,
                flexShrink: 0,
                cursor: 'col-resize',
                background: 'var(--border)',
              }}
            />
          <div
            ref={contentRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 24,
              background: 'var(--bg)',
            }}
          >
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{nodes.length} nodes, {blocks.length} note blocks.</p>
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
                      {editingNodeId === n.id ? (
                        <input
                          type="text"
                          defaultValue={n.title}
                          autoFocus
                          onBlur={(e) => handleSectionTitleSave(n.id, e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                            if (e.key === 'Escape') {
                              setEditingNodeId(null);
                            }
                          }}
                          style={{ flex: 1, marginRight: 8, padding: '6px 8px', fontSize: 15, fontWeight: 600, border: '1px solid var(--focus-ring)', borderRadius: 4, background: 'var(--input-bg)', color: 'var(--text)' }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingNodeId(n.id)}
                          style={{ flex: 1, textAlign: 'left', fontWeight: 600, padding: '4px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit' }}
                          title="Click to edit section title"
                        >
                          {n.title}
                        </button>
                      )}
                      <button
                          type="button"
                          onClick={() => handleAddBlock(n.id)}
                          style={{ fontSize: 13, padding: '4px 10px', border: '1px solid var(--link)', borderRadius: 4, background: 'var(--surface)', color: 'var(--link)', cursor: 'pointer' }}
                        >
                          + Add block
                        </button>
                    </div>
                    {nodeBlocks.length === 0 ? (
                      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>No notes</p>
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
