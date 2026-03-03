import { useCallback, useEffect, useState } from 'react';
import { getReadyToPublishItems, publishCurationItems, type ReadyToPublishItem } from '../api';

const CONTENT_TYPE_LABELS: Record<string, string> = {
  structure: 'Structure',
  notes: 'Notes',
  revision_notes: 'Revision Notes',
  questions: 'Questions',
};

function groupByChapter(items: ReadyToPublishItem[]): Map<string, ReadyToPublishItem[]> {
  const map = new Map<string, ReadyToPublishItem[]>();
  for (const item of items) {
    const list = map.get(item.chapter_id) ?? [];
    list.push(item);
    map.set(item.chapter_id, list);
  }
  return map;
}

export default function Publish() {
  const [items, setItems] = useState<ReadyToPublishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setMessage(null);
    getReadyToPublishItems()
      .then((list) => {
        setItems(list);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          list.forEach((i) => next.delete(i.id));
          return next;
        });
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleChapter(chapterId: string) {
    const chapterItems = items.filter((i) => i.chapter_id === chapterId);
    const allSelected = chapterItems.every((i) => selectedIds.has(i.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      chapterItems.forEach((i) => (allSelected ? next.delete(i.id) : next.add(i.id)));
      return next;
    });
  }

  async function handlePublish() {
    if (selectedIds.size === 0) return;
    setMessage(null);
    setPublishing(true);
    try {
      const result = await publishCurationItems({ item_ids: [...selectedIds] });
      setMessage({ type: 'success', text: `Published ${result.published} item${result.published !== 1 ? 's' : ''}.` });
      setSelectedIds(new Set());
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Publish failed' });
    } finally {
      setPublishing(false);
    }
  }

  const byChapter = groupByChapter(items);

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: 24 }}>Publish</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Items marked <strong>Ready to publish</strong> by SMEs in the curation app. Select items or whole chapters, then publish to copy draft → published.
      </p>

      {message && (
        <div
          style={{
            marginBottom: 20,
            padding: 12,
            borderRadius: 6,
            background: message.type === 'success' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(248, 81, 73, 0.15)',
            color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No items ready to publish.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={publishing || selectedIds.size === 0}
              onClick={handlePublish}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                background: selectedIds.size > 0 ? '#16a34a' : 'var(--border)',
                color: selectedIds.size > 0 ? '#fff' : 'var(--text-muted)',
                border: 0,
                borderRadius: 6,
                cursor: selectedIds.size > 0 && !publishing ? 'pointer' : 'not-allowed',
              }}
            >
              {publishing ? 'Publishing…' : `Publish selected (${selectedIds.size})`}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {Array.from(byChapter.entries()).map(([chapterId, chapterItems]) => {
              const first = chapterItems[0];
              const chapterLabel = `${first.subject_name} · Ch${first.chapter_sequence_number} ${first.chapter_title}`;
              const allInChapterSelected = chapterItems.every((i) => selectedIds.has(i.id));
              return (
                <div
                  key={chapterId}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--surface)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      background: 'var(--bg)',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allInChapterSelected}
                      onChange={() => toggleChapter(chapterId)}
                      aria-label={`Select all in ${chapterLabel}`}
                    />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{chapterLabel}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {chapterItems.length} item{chapterItems.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {chapterItems.map((item) => (
                      <li
                        key={item.id}
                        style={{
                          padding: '10px 16px',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                          aria-label={`${CONTENT_TYPE_LABELS[item.content_type] ?? item.content_type}`}
                        />
                        <span style={{ fontSize: 14 }}>{CONTENT_TYPE_LABELS[item.content_type] ?? item.content_type}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
