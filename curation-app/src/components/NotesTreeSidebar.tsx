import { useDroppable } from '@dnd-kit/core';
import type { DraftNode } from '../api';

export type TreeNode = {
  node: DraftNode;
  children: TreeNode[];
};

/** Build a tree from flat nodes (parent_id, sequence_number). */
export function buildNodesTree(nodes: DraftNode[]): TreeNode[] {
  const byParent = new Map<string | null, DraftNode[]>();
  for (const n of nodes) {
    const key = n.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
  }
  function children(parentId: string | null): TreeNode[] {
    const list = byParent.get(parentId) ?? [];
    return list.map((node) => ({ node, children: children(node.id) }));
  }
  return children(null);
}

const INDENT = 16;

const DEFAULT_SIDEBAR_WIDTH = 260;

type NotesTreeSidebarProps = {
  tree: TreeNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  blocksByNode: Record<string, { count: number }>;
  width?: number;
  flatOrder?: import('../api').DraftNode[];
  onIndent?: (index: number) => void;
  onOutdent?: (index: number) => void;
  onDeleteNode?: (nodeId: string) => void;
  onAddSection?: () => void;
  onAddChild?: (parentNode: import('../api').DraftNode) => void;
  onAddSibling?: (afterNode: import('../api').DraftNode) => void;
  savingStructure?: boolean;
};

function TreeItem({
  item,
  depth,
  isFirst,
  isLast,
  selectedNodeId,
  onSelectNode,
  blocksByNode,
  flatOrder,
  onIndent,
  onOutdent,
  onDeleteNode,
  onAddChild,
  onAddSibling,
  savingStructure,
}: {
  item: TreeNode;
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  blocksByNode: Record<string, { count: number }>;
  flatOrder?: import('../api').DraftNode[];
  onIndent?: (index: number) => void;
  onOutdent?: (index: number) => void;
  onDeleteNode?: (nodeId: string) => void;
  onAddChild?: (parentNode: import('../api').DraftNode) => void;
  onAddSibling?: (afterNode: import('../api').DraftNode) => void;
  savingStructure?: boolean;
}) {
  const isSelected = selectedNodeId === item.node.id;
  const blockCount = blocksByNode[item.node.id]?.count ?? 0;
  const flatIndex = flatOrder ? flatOrder.findIndex((n) => n.id === item.node.id) : -1;
  const canIndent = onIndent && flatIndex > 0;
  const canOutdent = onOutdent && item.node.parent_id != null;

  const { setNodeRef, isOver } = useDroppable({ id: `sidebar-${item.node.id}` });

  const showConnector = depth >= 1;
  const verticalTop = isFirst ? '50%' : 0;
  const verticalBottom = isLast ? '50%' : 0;
  const connectorWidth = depth * INDENT;

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        ref={setNodeRef}
        style={{
          position: 'relative',
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          ...(isOver ? { background: 'rgba(37, 99, 235, 0.12)', borderRadius: 4 } : {}),
        }}
      >
        {showConnector && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: connectorWidth,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: connectorWidth - INDENT / 2 - 1,
                width: 1,
                top: verticalTop,
                bottom: verticalBottom,
                background: 'var(--border)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: connectorWidth - INDENT / 2 - 1,
                width: INDENT / 2,
                top: '50%',
                height: 1,
                background: 'var(--border)',
              }}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => onSelectNode(item.node.id)}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'block',
            textAlign: 'left',
            padding: '6px 10px',
            paddingLeft: 10 + depth * INDENT,
            fontSize: 13,
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            background: isSelected ? 'var(--selected-bg)' : 'transparent',
            color: isSelected ? 'var(--link)' : 'var(--text)',
            fontWeight: isSelected ? 600 : 400,
          }}
          title={item.node.title}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
            {item.node.title}
          </span>
          {blockCount > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>({blockCount})</span>
          )}
        </button>
        {(onIndent != null && onOutdent != null) || onDeleteNode != null ? (
          <div style={{ flexShrink: 0, display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
            {onIndent != null && onOutdent != null && (
              <>
                <button
                  type="button"
                  onClick={() => flatIndex >= 0 && onIndent(flatIndex)}
                  disabled={!canIndent || savingStructure}
                  title="Indent (make sub-node of above)"
                  style={{
                    padding: '2px 6px',
                    fontSize: 11,
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    cursor: canIndent && !savingStructure ? 'pointer' : 'not-allowed',
                    opacity: canIndent ? 1 : 0.5,
                  }}
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => flatIndex >= 0 && onOutdent(flatIndex)}
                  disabled={!canOutdent || savingStructure}
                  title="Outdent (move up one level)"
                  style={{
                    padding: '2px 6px',
                    fontSize: 11,
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    cursor: canOutdent && !savingStructure ? 'pointer' : 'not-allowed',
                    opacity: canOutdent ? 1 : 0.5,
                  }}
                >
                  ←
                </button>
              </>
            )}
            {onDeleteNode != null && (
              <button
                type="button"
                onClick={() => onDeleteNode(item.node.id)}
                disabled={savingStructure}
                title="Delete this node and all its children (and their blocks)"
                style={{
                  padding: '2px 6px',
                  fontSize: 11,
                  border: '1px solid var(--danger, #dc2626)',
                  borderRadius: 4,
                  background: 'var(--danger-bg, rgba(220, 38, 38, 0.1))',
                  color: 'var(--danger, #dc2626)',
                  cursor: savingStructure ? 'not-allowed' : 'pointer',
                  opacity: savingStructure ? 0.5 : 1,
                }}
              >
                Delete
              </button>
            )}
            {onAddChild != null && (
              <button
                type="button"
                onClick={() => onAddChild(item.node)}
                disabled={savingStructure}
                title="Add child section"
                style={{
                  padding: '2px 6px',
                  fontSize: 11,
                  border: '1px solid var(--link)',
                  borderRadius: 4,
                  background: 'var(--surface)',
                  color: 'var(--link)',
                  cursor: savingStructure ? 'not-allowed' : 'pointer',
                  opacity: savingStructure ? 0.5 : 1,
                }}
              >
                + Child
              </button>
            )}
            {onAddSibling != null && (
              <button
                type="button"
                onClick={() => onAddSibling(item.node)}
                disabled={savingStructure}
                title="Add sibling after this"
                style={{
                  padding: '2px 6px',
                  fontSize: 11,
                  border: '1px solid var(--link)',
                  borderRadius: 4,
                  background: 'var(--surface)',
                  color: 'var(--link)',
                  cursor: savingStructure ? 'not-allowed' : 'pointer',
                  opacity: savingStructure ? 0.5 : 1,
                }}
              >
                + Sibling
              </button>
            )}
          </div>
        ) : null}
      </div>
      {item.children.map((child, index) => (
        <TreeItem
          key={child.node.id}
          item={child}
          depth={depth + 1}
          isFirst={index === 0}
          isLast={index === item.children.length - 1}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          blocksByNode={blocksByNode}
          flatOrder={flatOrder}
          onIndent={onIndent}
          onOutdent={onOutdent}
          onDeleteNode={onDeleteNode}
          onAddChild={onAddChild}
          onAddSibling={onAddSibling}
          savingStructure={savingStructure}
        />
      ))}
    </div>
  );
}

export function NotesTreeSidebar({ tree, selectedNodeId, onSelectNode, blocksByNode, width = DEFAULT_SIDEBAR_WIDTH, flatOrder, onIndent, onOutdent, onDeleteNode, onAddSection, onAddChild, onAddSibling, savingStructure }: NotesTreeSidebarProps) {
  return (
    <div
      style={{
        width,
        minWidth: 200,
        flexShrink: 0,
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, paddingLeft: 10 }}>
        Structure <span style={{ fontWeight: 400, color: 'var(--text-muted)', opacity: 0.9 }}>(drop block here)</span>
        {onIndent != null && <span style={{ display: 'block', fontSize: 11, marginTop: 2 }}>→ indent ← outdent</span>}
      </div>
      {tree.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', paddingLeft: 10 }}>No nodes</p>
      ) : (
        tree.map((item, index) => (
          <TreeItem
            key={item.node.id}
            item={item}
            depth={0}
            isFirst={index === 0}
            isLast={index === tree.length - 1}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            blocksByNode={blocksByNode}
            flatOrder={flatOrder}
            onIndent={onIndent}
            onOutdent={onOutdent}
            onDeleteNode={onDeleteNode}
            onAddChild={onAddChild}
            onAddSibling={onAddSibling}
            savingStructure={savingStructure}
          />
        ))
      )}
      {onAddSection != null && (
        <button
          type="button"
          onClick={onAddSection}
          disabled={savingStructure}
          title="Add top-level section at end"
          style={{
            marginTop: 12,
            marginLeft: 10,
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid var(--link)',
            borderRadius: 4,
            background: 'var(--surface)',
            color: 'var(--link)',
            cursor: savingStructure ? 'not-allowed' : 'pointer',
            opacity: savingStructure ? 0.5 : 1,
          }}
        >
          + Add section
        </button>
      )}
    </div>
  );
}
