import type React from 'react';
import { useMemo, useRef, useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import { OrderedList } from '@tiptap/extension-list';
import { mergeAttributes } from '@tiptap/core';
import type { DraftNoteBlock } from '../api';
import { uploadImage, listItemImages } from '../api';

/** OrderedList with listStyle: decimal | lower-roman | lower-alpha-parens (rendered as class for CSS). */
const OrderedListWithStyles = OrderedList.extend({
  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (element) =>
          element.hasAttribute('start') ? parseInt(element.getAttribute('start') || '', 10) : 1,
      },
      type: {
        default: null,
        parseHTML: (element) => element.getAttribute('type'),
      },
      listStyle: {
        default: 'decimal',
        parseHTML: (element) =>
          element.getAttribute('data-list-style') ||
          (element.classList?.contains('list-lower-roman') ? 'lower-roman' : element.classList?.contains('list-alpha-parens') ? 'lower-alpha-parens' : 'decimal'),
        renderHTML: (attributes) => {
          if (!attributes.listStyle || attributes.listStyle === 'decimal') return {};
          return { class: attributes.listStyle === 'lower-roman' ? 'list-lower-roman' : 'list-alpha-parens' };
        },
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const { start, listStyle, ...rest } = HTMLAttributes as Record<string, unknown> & { start?: number; listStyle?: string };
    const cls =
      listStyle === 'lower-roman' ? 'list-lower-roman' : listStyle === 'lower-alpha-parens' ? 'list-alpha-parens' : undefined;
    const attrs = mergeAttributes(this.options.HTMLAttributes, rest, cls ? { class: cls } : {});
    return start === 1 ? ['ol', attrs, 0] : ['ol', mergeAttributes(attrs, { start }), 0];
  },
});

const EDITOR_EXTENSIONS = [
  StarterKit.configure({ orderedList: false }),
  OrderedListWithStyles,
  Link.configure({ openOnClick: false }),
  Image.configure({
    inline: false,
    allowBase64: false,
    resize: {
      enabled: true,
      directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      minWidth: 80,
      minHeight: 60,
      alwaysPreserveAspectRatio: false,
    },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TableKit.configure({ resizable: true }),
];

type RichTextBlockEditorProps = {
  block: DraftNoteBlock;
  onContentChange: (blockId: string, html: string) => void;
  /** Curation item id (chapter) for image "Choose from chapter". */
  itemId?: string;
  /** Called when editor gains focus; html is content at focus time (for undo snapshot). */
  onFocus?: (blockId: string, contentHtml: string) => void;
  /** Called when editor loses focus (push undo entry in parent). */
  onBlur?: (blockId: string) => void;
};

const API_BASE = import.meta.env.VITE_CURATION_API ?? '';

const toolbarButtonStyle: React.CSSProperties = {
  cursor: 'pointer',
  padding: '4px 8px',
  fontSize: 13,
  border: '1px solid #ccc',
  borderRadius: 4,
  background: '#fff',
};

type ListStyle = 'bullet' | 'decimal' | 'lower-roman' | 'lower-alpha-parens';

function ListDropdown({ editor, toolbarButtonStyle }: { editor: Editor; toolbarButtonStyle: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const olAttrs = editor.getAttributes('orderedList');
  const activeList: ListStyle | null = editor.isActive('bulletList')
    ? 'bullet'
    : editor.isActive('orderedList')
      ? (olAttrs.listStyle === 'lower-roman' ? 'lower-roman' : olAttrs.listStyle === 'lower-alpha-parens' ? 'lower-alpha-parens' : 'decimal')
      : null;

  const apply = (style: ListStyle) => {
    if (style === 'bullet') {
      editor.chain().focus().toggleBulletList().run();
    } else {
      const listStyle = style === 'decimal' ? 'decimal' : style === 'lower-roman' ? 'lower-roman' : 'lower-alpha-parens';
      if (editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run();
      const chain = editor.chain().focus();
      if (!editor.isActive('orderedList')) chain.toggleOrderedList();
      chain.updateAttributes('orderedList', { listStyle }).run();
    }
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        style={{ ...toolbarButtonStyle, ...(activeList ? { fontWeight: 600 } : {}) }}
        onClick={() => setOpen((o) => !o)}
        title="List style"
      >
        List ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: 120,
            color: '#000',
          }}
        >
          {(
            [
              { style: 'bullet' as const, label: '• Bullet' },
              { style: 'decimal' as const, label: '1. Decimal' },
              { style: 'lower-roman' as const, label: 'i. Roman' },
              { style: 'lower-alpha-parens' as const, label: '(a) Alpha' },
            ] as const
          ).map(({ style, label }) => (
            <button
              key={style}
              type="button"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                border: 'none',
                background: activeList === style ? 'var(--focus-ring)' : 'transparent',
                color: activeList === style ? '#fff' : '#000',
                cursor: 'pointer',
                fontSize: 13,
              }}
              onClick={() => apply(style)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type AlignOption = 'left' | 'center' | 'right' | 'justify';

function AlignmentDropdown({ editor, toolbarButtonStyle }: { editor: Editor; toolbarButtonStyle: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const currentAlign: AlignOption =
    editor.getAttributes('paragraph').textAlign ||
    editor.getAttributes('heading').textAlign ||
    'left';

  const apply = (align: AlignOption) => {
    editor.chain().focus().setTextAlign(align).run();
    setOpen(false);
  };

  const options: { align: AlignOption; label: string }[] = [
    { align: 'left', label: 'Left' },
    { align: 'center', label: 'Center' },
    { align: 'right', label: 'Right' },
    { align: 'justify', label: 'Justify' },
  ];

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        style={{ ...toolbarButtonStyle, ...(currentAlign !== 'left' ? { fontWeight: 600 } : {}) }}
        onClick={() => setOpen((o) => !o)}
        title="Alignment"
      >
        Alignment ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: 100,
            color: '#000',
          }}
        >
          {options.map(({ align, label }) => (
            <button
              key={align}
              type="button"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                border: 'none',
                background: currentAlign === align ? 'var(--focus-ring)' : 'transparent',
                color: currentAlign === align ? '#fff' : '#000',
                cursor: 'pointer',
                fontSize: 13,
              }}
              onClick={() => apply(align)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type TableAction =
  | 'insertTable'
  | 'addRowBefore'
  | 'addRowAfter'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteRow'
  | 'deleteColumn'
  | 'deleteTable';

function TableDropdown({ editor, toolbarButtonStyle }: { editor: Editor; toolbarButtonStyle: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inTable = editor.isActive('tableCell') || editor.isActive('tableHeader');

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const run = (action: TableAction) => {
    const chain = editor.chain().focus();
    switch (action) {
      case 'insertTable':
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case 'addRowBefore':
        chain.addRowBefore().run();
        break;
      case 'addRowAfter':
        chain.addRowAfter().run();
        break;
      case 'addColumnBefore':
        chain.addColumnBefore().run();
        break;
      case 'addColumnAfter':
        chain.addColumnAfter().run();
        break;
      case 'deleteRow':
        chain.deleteRow().run();
        break;
      case 'deleteColumn':
        chain.deleteColumn().run();
        break;
      case 'deleteTable':
        chain.deleteTable().run();
        break;
    }
    setOpen(false);
  };

  const dropStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    background: '#fff',
    border: '1px solid #ccc',
    borderRadius: 4,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    zIndex: 1000,
    minWidth: 160,
    color: '#000',
  };

  const itemStyle = (disabled: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '6px 12px',
    border: 'none',
    background: 'transparent',
    color: '#000',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    opacity: disabled ? 0.5 : 1,
  });

  const addItems: { action: TableAction; label: string }[] = [
    { action: 'insertTable', label: 'Insert table' },
    { action: 'addRowBefore', label: 'Add row before' },
    { action: 'addRowAfter', label: 'Add row after' },
    { action: 'addColumnBefore', label: 'Add column before' },
    { action: 'addColumnAfter', label: 'Add column after' },
  ];
  const delItems: { action: TableAction; label: string }[] = [
    { action: 'deleteRow', label: 'Del row' },
    { action: 'deleteColumn', label: 'Del col' },
    { action: 'deleteTable', label: 'Del table' },
  ];

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        style={{ ...toolbarButtonStyle, ...(inTable ? { fontWeight: 600 } : {}) }}
        onClick={() => setOpen((o) => !o)}
        title="Table"
      >
        Table ▾
      </button>
      {open && (
        <div style={dropStyle}>
          {addItems.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              style={itemStyle(action !== 'insertTable' && !inTable)}
              disabled={action !== 'insertTable' && !inTable}
              onClick={() => (action === 'insertTable' || inTable) && run(action)}
            >
              {label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid #ccc', margin: '4px 0' }} />
          {delItems.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              style={itemStyle(!inTable)}
              disabled={!inTable}
              onClick={() => inTable && run(action)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageDropdown({
  editor,
  itemId,
  toolbarButtonStyle,
}: {
  editor: Editor;
  itemId: string | undefined;
  toolbarButtonStyle: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [images, setImages] = useState<Array<{ url: string; filename: string | null }>>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  /** In dev use backend origin so images load from :3000 (avoids Vite proxy). In prod use current origin. */
  const imageSrc = (url: string) => {
    const path = url.startsWith('/') ? url : `/${url.replace(/^\//, '')}`;
    if (typeof window === 'undefined') return path;
    const origin = import.meta.env.DEV
      ? (import.meta.env.VITE_CURATION_API || 'http://localhost:3000')
      : window.location.origin;
    return `${origin}${path}`;
  };

  const handleUpload = async (file: File) => {
    try {
      const { url } = await uploadImage(file, itemId);
      editor.chain().focus().setImage({ src: imageSrc(url) }).run();
      setOpen(false);
    } catch (err) {
      console.error('Image upload failed:', err);
      alert(err instanceof Error ? err.message : 'Image upload failed');
    }
  };

  const handleChooseFromChapter = async () => {
    if (!itemId) return;
    setOpen(false);
    setPickerOpen(true);
    setLoadingImages(true);
    try {
      const data = await listItemImages(itemId);
      setImages(data.images);
    } catch (err) {
      console.error('Failed to load images:', err);
      alert(err instanceof Error ? err.message : 'Failed to load images');
      setPickerOpen(false);
    } finally {
      setLoadingImages(false);
    }
  };

  const selectImage = (url: string) => {
    editor.chain().focus().setImage({ src: imageSrc(url) }).run();
    setPickerOpen(false);
  };

  return (
    <>
      <div ref={containerRef} style={{ position: 'relative' }}>
        <button
          type="button"
          style={toolbarButtonStyle}
          onClick={() => setOpen((o) => !o)}
          title="Image"
        >
          Image ▾
        </button>
        {open && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              background: '#fff',
              border: '1px solid #ccc',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: 160,
              color: '#000',
            }}
          >
            <button
              type="button"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                color: '#000',
                cursor: 'pointer',
                fontSize: 13,
              }}
              onClick={() => {
                setOpen(false);
                fileInputRef.current?.click();
              }}
            >
              Upload new
            </button>
            {itemId && (
              <button
                type="button"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'transparent',
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
                onClick={handleChooseFromChapter}
              >
                Choose from chapter
              </button>
            )}
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />
      {pickerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              color: '#000',
              padding: 20,
              borderRadius: 8,
              maxWidth: 400,
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Choose from chapter</h3>
            {loadingImages ? (
              <p style={{ margin: 0 }}>Loading…</p>
            ) : images.length === 0 ? (
              <p style={{ margin: 0 }}>No images uploaded for this chapter yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {images.map((img) => (
                  <li key={img.url}>
                    <button
                      type="button"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: 8,
                        border: '1px solid #ccc',
                        borderRadius: 4,
                        background: '#fff',
                        color: '#000',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onClick={() => selectImage(img.url)}
                    >
                      <img src={imageSrc(img.url)} alt="" style={{ width: 48, height: 48, objectFit: 'cover' }} />
                      <span style={{ fontSize: 13 }}>{img.filename || img.url.replace(/^.*\//, '')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              style={{ marginTop: 12, padding: '6px 12px', fontSize: 13 }}
              onClick={() => setPickerOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Toolbar({ editor, itemId }: { editor: Editor | null; itemId?: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => setTick((t) => t + 1);
    editor.on('selectionUpdate', onUpdate);
    return () => editor.off('selectionUpdate', onUpdate);
  }, [editor]);
  if (!editor) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
      <button
        type="button"
        style={{ ...toolbarButtonStyle, fontWeight: editor.isActive('bold') ? 'bold' : 'normal' }}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        B
      </button>
      <button
        type="button"
        style={{ ...toolbarButtonStyle, fontStyle: editor.isActive('italic') ? 'italic' : 'normal' }}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        I
      </button>
      <button
        type="button"
        style={{ ...toolbarButtonStyle, textDecoration: editor.isActive('underline') ? 'underline' : 'none' }}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
      >
        U
      </button>
      <button
        type="button"
        style={toolbarButtonStyle}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        H2
      </button>
      <ListDropdown editor={editor} toolbarButtonStyle={toolbarButtonStyle} />
      <AlignmentDropdown editor={editor} toolbarButtonStyle={toolbarButtonStyle} />
      <button
        type="button"
        style={toolbarButtonStyle}
        onClick={() => editor.chain().focus().setLink({ href: '' }).run()}
        title="Link"
      >
        Link
      </button>
      <TableDropdown editor={editor} toolbarButtonStyle={toolbarButtonStyle} />
      <ImageDropdown editor={editor} itemId={itemId} toolbarButtonStyle={toolbarButtonStyle} />
    </div>
  );
}

export function RichTextBlockEditor({ block, onContentChange, itemId, onFocus, onBlur }: RichTextBlockEditorProps) {
  const extensions = useMemo(() => EDITOR_EXTENSIONS, []);
  const initialContentSetRef = useRef<string | null>(null);
  const editor = useEditor(
    {
      extensions,
      content: block.content_html || '',
      onUpdate: ({ editor }) => {
        onContentChange(block.id, editor.getHTML());
      },
    },
    [block.id]
  );

  useEffect(() => {
    initialContentSetRef.current = null;
  }, [block.id]);

  useEffect(() => {
    if (!editor || initialContentSetRef.current === block.id) return;
    const html = (block.content_html || '').trim();
    if (html.length > 0) {
      editor.commands.setContent(html);
      initialContentSetRef.current = block.id;
    }
  }, [editor, block.id, block.content_html]);

  useEffect(() => {
    if (!editor || (!onFocus && !onBlur)) return;
    const handleFocus = () => {
      onFocus?.(block.id, editor.getHTML());
    };
    const handleBlur = () => {
      onBlur?.(block.id);
    };
    editor.on('focus', handleFocus);
    editor.on('blur', handleBlur);
    return () => {
      editor.off('focus', handleFocus);
      editor.off('blur', handleBlur);
    };
  }, [editor, block.id, onFocus, onBlur]);

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8, background: '#fff' }}>
      <Toolbar editor={editor} itemId={itemId} />
      <EditorContent editor={editor} />
    </div>
  );
}

/** If value looks like plain text (no HTML), convert newlines to HTML so formatting is preserved in TipTap. */
function valueToEditorContent(value: string): string {
  const text = value || '';
  if (!text) return '';
  if (text.includes('<') && text.includes('>')) return text;
  const paragraphs = text.split(/\n\n+/);
  const html = paragraphs.map((p) => `<p>${p.split('\n').join('<br>')}</p>`).join('');
  return html || '<p></p>';
}

export type RichTextFieldProps = {
  value: string;
  onChange: (html: string) => void;
  /** Optional key to remount editor when source changes (e.g. question id). */
  editorKey?: string;
  /** Curation item id (chapter) for image "Choose from chapter". */
  itemId?: string;
};

export function RichTextField({ value, onChange, editorKey, itemId }: RichTextFieldProps) {
  const extensions = useMemo(() => EDITOR_EXTENSIONS, []);
  const initialContent = useMemo(() => valueToEditorContent(value), [editorKey]);
  const editor = useEditor({
    extensions,
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  }, [editorKey]);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, background: 'var(--surface)' }}>
      <Toolbar editor={editor} itemId={itemId} />
      <EditorContent editor={editor} />
    </div>
  );
}
