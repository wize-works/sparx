'use client';

// JSON-mode block editor.
//
// Mirrors the @sparx/ui RichTextEditor's toolbar shape but persists the
// TipTap doc as JSON (the on-the-wire shape api-rest stores in
// `content_entries.body`). The dashboard's CMS edit form embeds this; the
// HTML-emitting RichTextEditor in @sparx/ui stays available for places
// where HTML output is convenient (email composer, support replies).
//
// Block coverage matches `extensions.ts`: paragraph, headings, lists,
// blockquote, code-with-language, table, image (with focal-point + caption),
// callout (info/success/warning/danger), embed (YouTube/Vimeo/Loom/Spotify),
// and @-reference autocomplete. Insertion happens via the inline toolbar
// for the common cases and the "More blocks" overflow for the rest.

import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  Bold,
  Code as CodeIcon,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Tv,
  Undo2,
} from 'lucide-react';
import { cn } from '@sparx/ui';
import { cmsEditorExtensions, emptyDoc } from './extensions';
import type { ReferenceSearchFn } from './nodes';
import type { CalloutVariant } from './nodes';
import { ALLOWED_CODE_LANGUAGES } from './serialize';
import type { JSONContent } from '@tiptap/react';

export type CmsDoc = Record<string, unknown>;

export interface ContentBlockEditorProps {
  value?: CmsDoc;
  onChange?: (doc: CmsDoc) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /**
   * DOM id forwarded to the contenteditable surface. Lets a sibling
   * <Label htmlFor> click-focus into the editor and screen-readers walk
   * aria-labelledby/describedby references back to a visible label.
   */
  id?: string;
  /**
   * Search callback for the @-mention popover. The dashboard supplies one
   * that hits /v1/content/entries; consumers without a reference index can
   * omit it and the popover stays empty.
   */
  referenceSearch?: ReferenceSearchFn;
  /**
   * Open a media picker and resolve to an upload result. The dashboard
   * supplies one that opens the asset library overlay; without it the
   * "Insert image" button falls back to a URL prompt.
   */
  pickImage?: () => Promise<{
    src: string;
    alt?: string;
    caption?: string;
    assetId?: string;
  } | null>;
}

interface ToolButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}

function ToolButton({ onClick, active, disabled, label, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'bg-[var(--module-active-tint)] text-[var(--module-active-text)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]'
      )}
    >
      {children}
    </button>
  );
}

function ToolDivider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-[var(--color-border-default)]" />;
}

// Small floating overlay used by the "More blocks" button.
function BlockMenu({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className={cn(
        'absolute z-50 mt-1 min-w-[14rem] rounded-md border bg-[var(--color-bg-surface)] p-1 shadow-lg',
        'border-[var(--color-border-default)]'
      )}
    >
      {children}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
        'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]',
        'focus-visible:bg-[var(--color-bg-subtle)] focus-visible:outline-none'
      )}
    >
      {icon ? <span className="text-[var(--color-text-secondary)]">{icon}</span> : null}
      {label}
    </button>
  );
}

export function ContentBlockEditor({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  ariaLabel = 'Content editor',
  id,
  referenceSearch,
  pickImage,
}: ContentBlockEditorProps) {
  const extensions = React.useMemo(
    () => cmsEditorExtensions({ placeholder, referenceSearch }),
    [placeholder, referenceSearch]
  );

  const editor = useEditor({
    extensions,
    content: (value ?? emptyDoc()) as JSONContent,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getJSON());
    },
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        ...(id ? { id } : {}),
        class: cn(
          'min-h-[14rem] w-full px-3 py-2 text-sm text-[var(--color-text-primary)]',
          'focus:outline-none',
          'prose-headings:font-medium prose-headings:text-[var(--color-text-primary)]',
          '[&_h2]:mt-4 [&_h3]:mt-3 [&_p]:my-2',
          '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
          '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border-default)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--color-text-secondary)]',
          '[&_code]:rounded [&_code]:bg-[var(--color-bg-subtle)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
          '[&_pre]:my-2 [&_pre]:rounded-md [&_pre]:bg-[var(--color-bg-subtle)] [&_pre]:p-3 [&_pre]:text-xs',
          '[&_figure]:my-3 [&_figure]:overflow-hidden [&_figure]:rounded-md',
          '[&_figure_img]:h-auto [&_figure_img]:max-w-full',
          '[&_figcaption]:mt-1 [&_figcaption]:text-center [&_figcaption]:text-xs [&_figcaption]:text-[var(--color-text-tertiary)]',
          '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
          '[&_th]:bg-[var(--color-bg-subtle)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
          '[&_td]:border [&_td]:border-[var(--color-border-default)] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[var(--color-border-default)]',
          '[&_aside.sparx-callout]:my-3 [&_aside.sparx-callout]:rounded-md [&_aside.sparx-callout]:border-l-4 [&_aside.sparx-callout]:px-3 [&_aside.sparx-callout]:py-2',
          '[&_aside.sparx-callout--info]:border-[var(--color-info-border)] [&_aside.sparx-callout--info]:bg-[var(--color-info-bg)]',
          '[&_aside.sparx-callout--success]:border-[var(--color-success-border)] [&_aside.sparx-callout--success]:bg-[var(--color-success-bg)]',
          '[&_aside.sparx-callout--warning]:border-[var(--color-warning-border)] [&_aside.sparx-callout--warning]:bg-[var(--color-warning-bg)]',
          '[&_aside.sparx-callout--danger]:border-[var(--color-danger-border)] [&_aside.sparx-callout--danger]:bg-[var(--color-danger-bg)]',
          '[&_.sparx-reference]:rounded [&_.sparx-reference]:bg-[var(--color-info-bg)] [&_.sparx-reference]:px-1.5 [&_.sparx-reference]:py-0.5 [&_.sparx-reference]:text-[var(--module-active)]'
        ),
      },
    },
  });

  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!editor || !value) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(value)) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  const setLink = () => {
    const previous = (editor.getAttributes('link') as { href?: string }).href ?? '';
    const next = window.prompt('Link URL', previous);
    if (next === null) return;
    if (next === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: next }).run();
  };

  const insertImage = async () => {
    if (pickImage) {
      const picked = await pickImage();
      if (!picked) return;
      editor
        .chain()
        .focus()
        .setSparxImage({
          src: picked.src,
          alt: picked.alt,
          caption: picked.caption,
          assetId: picked.assetId,
        })
        .run();
      return;
    }
    const url = window.prompt('Image URL');
    if (!url) return;
    const alt = window.prompt('Alt text (required for accessibility)') ?? '';
    editor.chain().focus().setSparxImage({ src: url, alt }).run();
  };

  const insertEmbed = () => {
    const url = window.prompt(
      'Embed URL (YouTube, Vimeo, Loom, Spotify) — pasted as-is, the storefront re-validates before rendering'
    );
    if (!url) return;
    // detectProvider is in extensions but we re-derive here to avoid an
    // import cycle. Keeps the editor self-contained.
    const lc = url.toLowerCase();
    const provider =
      lc.includes('youtube.com') || lc.includes('youtu.be')
        ? 'youtube'
        : lc.includes('vimeo.com')
          ? 'vimeo'
          : lc.includes('loom.com')
            ? 'loom'
            : lc.includes('spotify.com')
              ? 'spotify'
              : lc.includes('twitter.com') || lc.includes('x.com')
                ? 'twitter'
                : 'unknown';
    editor.chain().focus().setEmbed({ provider, url }).run();
  };

  const insertCallout = (variant: CalloutVariant) => {
    editor.chain().focus().setCallout(variant).run();
    setMenuOpen(false);
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    setMenuOpen(false);
  };

  const insertHorizontalRule = () => {
    editor.chain().focus().setHorizontalRule().run();
    setMenuOpen(false);
  };

  const toggleCodeBlock = () => {
    const lang =
      window.prompt(
        `Code language (one of: ${[...ALLOWED_CODE_LANGUAGES].slice(0, 12).join(', ')}…)`
      ) ?? '';
    editor
      .chain()
      .focus()
      .toggleCodeBlock(lang ? { language: lang } : undefined)
      .run();
    setMenuOpen(false);
  };

  return (
    <div
      className={cn(
        'relative rounded-md border bg-[var(--color-bg-surface)]',
        'border-[var(--color-border-default)] focus-within:border-[var(--color-border-focus)]',
        'focus-within:ring-2 focus-within:ring-[var(--color-border-focus)] focus-within:ring-offset-2',
        'transition-colors duration-150',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border-default)] p-1"
      >
        <ToolButton
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Inline code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <CodeIcon className="h-3.5 w-3.5" />
        </ToolButton>

        <ToolDivider />

        <ToolButton
          label="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolButton>

        <ToolDivider />

        <ToolButton
          label="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Ordered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolButton>

        <ToolDivider />

        <ToolButton label="Link" active={editor.isActive('link')} onClick={setLink}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Insert image" onClick={() => void insertImage()}>
          <ImageIcon className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Insert embed" onClick={insertEmbed}>
          <Tv className="h-3.5 w-3.5" />
        </ToolButton>

        <ToolDivider />

        <span className="relative">
          <ToolButton label="More blocks" onClick={() => setMenuOpen((v) => !v)}>
            <Plus className="h-3.5 w-3.5" />
          </ToolButton>
          <BlockMenu open={menuOpen} onClose={() => setMenuOpen(false)}>
            <MenuItem
              icon={<Info className="h-3.5 w-3.5" />}
              label="Callout — info"
              onClick={() => insertCallout('info')}
            />
            <MenuItem
              icon={<Info className="h-3.5 w-3.5" />}
              label="Callout — success"
              onClick={() => insertCallout('success')}
            />
            <MenuItem
              icon={<Info className="h-3.5 w-3.5" />}
              label="Callout — warning"
              onClick={() => insertCallout('warning')}
            />
            <MenuItem
              icon={<Info className="h-3.5 w-3.5" />}
              label="Callout — danger"
              onClick={() => insertCallout('danger')}
            />
            <MenuItem
              icon={<TableIcon className="h-3.5 w-3.5" />}
              label="Insert 3×3 table"
              onClick={insertTable}
            />
            <MenuItem
              icon={<CodeIcon className="h-3.5 w-3.5" />}
              label="Code block (with language)"
              onClick={toggleCodeBlock}
            />
            <MenuItem
              icon={<Minus className="h-3.5 w-3.5" />}
              label="Horizontal rule"
              onClick={insertHorizontalRule}
            />
          </BlockMenu>
        </span>

        <span className="ml-auto flex items-center gap-0.5">
          <ToolButton
            label="Undo"
            disabled={!editor.can().chain().focus().undo().run()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            label="Redo"
            disabled={!editor.can().chain().focus().redo().run()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </ToolButton>
        </span>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
ContentBlockEditor.displayName = 'ContentBlockEditor';
