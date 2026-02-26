import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getStructure, saveStructure, setStatus, type DraftNode } from '../api';
import { buildNodesTree } from '../components/NotesTreeSidebar';
import { collectNodeAndDescendantIds, flattenTree, renumberStructureNodes } from '../structureUtils';

export default function StructureEditor() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<DraftNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!itemId) return;
    getStructure(itemId)
      .then(setNodes)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [itemId]);

  async function handleSave() {
    if (!itemId) return;
    setSaving(true);
    setError('');
    try {
      const payload = nodes.map((n, i) => ({
        id: n.id,
        parent_id: n.parent_id,
        title: n.title,
        sequence_number: n.sequence_number ?? i + 1,
        depth: n.depth ?? 0,
        level_label: n.level_label || 'Section',
      }));
      const { nodes: updatedNodes } = await saveStructure(itemId, payload);
      setNodes(updatedNodes);
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

  const tree = useMemo(() => buildNodesTree(nodes), [nodes]);
  const flatOrder = useMemo(() => flattenTree(tree), [tree]);

  function handleIndent(index: number) {
    if (index <= 0) return;
    const node = flatOrder[index];
    const newParent = flatOrder[index - 1];
    const maxSeq = Math.max(
      0,
      ...nodes.filter((n) => n.parent_id === newParent.id).map((n) => n.sequence_number)
    );
    const updated = nodes.map((n) =>
      n.id === node.id ? { ...n, parent_id: newParent.id, sequence_number: maxSeq + 1 } : n
    );
    setNodes(renumberStructureNodes(updated));
  }

  function handleOutdent(index: number) {
    const node = flatOrder[index];
    if (node.parent_id == null) return;
    const parent = nodes.find((n) => n.id === node.parent_id);
    if (!parent) return;
    const updated = nodes.map((n) =>
      n.id === node.id
        ? { ...n, parent_id: parent.parent_id, sequence_number: parent.sequence_number + 1 }
        : n
    );
    setNodes(renumberStructureNodes(updated));
  }

  async function handleDeleteNode(index: number) {
    if (!itemId) return;
    const node = flatOrder[index];
    const idsToDelete = collectNodeAndDescendantIds(nodes, node.id);
    const count = idsToDelete.size;
    if (!window.confirm(`Delete this node and ${count - 1} descendant(s)? All note blocks in them will be removed.`)) return;
    setSaving(true);
    setError('');
    try {
      const updatedNodes = renumberStructureNodes(nodes.filter((n) => !idsToDelete.has(n.id)));
      const { nodes: savedNodes } = await saveStructure(itemId, updatedNodes);
      setNodes(savedNodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete node');
    } finally {
      setSaving(false);
    }
  }

  if (!itemId) return null;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24, color: 'var(--text)' }}>
      <header style={{ marginBottom: 24 }}>
        <Link to="/" style={{ color: 'var(--link)', textDecoration: 'none', fontSize: 14 }}>← Back to list</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Structure editor</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: 'var(--link)', color: '#fff', border: 0, borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={handleReadyToPublish} disabled={saving} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: '#16a34a', color: '#fff', border: 0, borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer' }}>
              Mark Ready to Publish
            </button>
          </div>
        </div>
      </header>
      {error && <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : nodes.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No draft nodes. Run curation import for this chapter.</p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', padding: '16px 0', margin: 0, background: 'var(--surface)', borderRadius: 8, boxShadow: 'var(--shadow)', minWidth: 0 }}>
            {flatOrder.map((n, index) => (
              <li
                key={n.id}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minWidth: 0,
                }}
              >
                <div style={{ flex: 1, minWidth: 0, marginLeft: (n.depth ?? 0) * 20 }}>
                  <span style={{ fontWeight: 500 }}>{n.title}</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>{n.level_label}</span>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', gap: 4, minWidth: 140 }}>
                  <button
                    type="button"
                    onClick={() => handleIndent(index)}
                    disabled={index === 0}
                    title="Indent (make sub-node of above)"
                    style={{
                      padding: '5px 10px',
                      fontSize: 12,
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      cursor: index === 0 ? 'not-allowed' : 'pointer',
                      opacity: index === 0 ? 0.5 : 1,
                      fontWeight: 500,
                    }}
                  >
                    Indent
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOutdent(index)}
                    disabled={n.parent_id == null}
                    title="Outdent (move up one level)"
                    style={{
                      padding: '5px 10px',
                      fontSize: 12,
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      cursor: n.parent_id == null ? 'not-allowed' : 'pointer',
                      opacity: n.parent_id == null ? 0.5 : 1,
                      fontWeight: 500,
                    }}
                  >
                    Outdent
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteNode(index)}
                    disabled={saving}
                    title="Delete this node and all its children (and their note blocks)"
                    style={{
                      padding: '5px 10px',
                      fontSize: 12,
                      border: '1px solid var(--danger, #dc2626)',
                      borderRadius: 4,
                      background: 'var(--danger-bg, rgba(220, 38, 38, 0.1))',
                      color: 'var(--danger, #dc2626)',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.5 : 1,
                      fontWeight: 500,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
