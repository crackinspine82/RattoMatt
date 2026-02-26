import type { DraftNode } from './api';
import { buildNodesTree, type TreeNode } from './components/NotesTreeSidebar';

/** Level labels by depth: Section (0), Topic (1), Subtopic (2), Point (3), Sub-point (4+). */
export const LEVEL_LABELS = ['Section', 'Topic', 'Subtopic', 'Point', 'Sub-point'] as const;

export function getLevelLabelForDepth(depth: number): string {
  return LEVEL_LABELS[Math.min(depth, LEVEL_LABELS.length - 1)] ?? 'Section';
}

/** Generate a temporary id for a new node (not persisted until Save). */
export function generateTempNodeId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Flatten tree to depth-first order. */
export function flattenTree(tree: TreeNode[]): DraftNode[] {
  const out: DraftNode[] = [];
  function walk(items: TreeNode[]) {
    for (const { node, children: ch } of items) {
      out.push(node);
      walk(ch);
    }
  }
  walk(tree);
  return out;
}

/**
 * Collect a node and all its descendants by parent_id chain.
 * Used to delete a subtree (node + children + their blocks).
 */
export function collectNodeAndDescendantIds(nodes: DraftNode[], nodeId: string): Set<string> {
  const set = new Set<string>([nodeId]);
  let added = true;
  while (added) {
    added = false;
    for (const n of nodes) {
      if (n.parent_id != null && set.has(n.parent_id) && !set.has(n.id)) {
        set.add(n.id);
        added = true;
      }
    }
  }
  return set;
}

/**
 * Recompute depth and sequence_number from current parent_id so the tree is consistent.
 * Uses existing tree order (from buildNodesTree) and assigns depth + 1-based sequence per parent.
 */
export function renumberStructureNodes(nodes: DraftNode[]): DraftNode[] {
  const tree = buildNodesTree(nodes);
  const flat = flattenTree(tree);
  const idToNode = new Map(flat.map((n) => [n.id, n]));

  function getDepth(node: DraftNode): number {
    if (!node.parent_id) return 0;
    const p = idToNode.get(node.parent_id);
    return p ? 1 + getDepth(p) : 0;
  }

  return flat.map((node, i) => {
    const depth = getDepth(node);
    const siblingIndex = flat
      .slice(0, i + 1)
      .filter((m) => m.parent_id === node.parent_id).length;
    return {
      ...node,
      depth,
      sequence_number: siblingIndex,
    };
  });
}
