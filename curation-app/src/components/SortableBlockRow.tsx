import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type SortableBlockRowProps = {
  block: { id: string };
  children: ReactNode;
};

export function SortableBlockRow({ block, children }: SortableBlockRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={{ ...style, marginTop: 8, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          title="Drag to reorder or move to another section"
          style={{
            flexShrink: 0,
            cursor: 'grab',
            padding: '8px 4px',
            marginTop: 4,
            color: 'var(--text-muted)',
            fontSize: 16,
            lineHeight: 1,
            userSelect: 'none',
            touchAction: 'none',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ⋮⋮
        </div>
        {children}
      </div>
    </div>
  );
}
