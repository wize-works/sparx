'use client';

// JSON-mode block editor.
//
// Mirrors the @sparx/ui RichTextEditor's toolbar shape but persists the
// TipTap doc as JSON (the on-the-wire shape api-rest stores in
// `content_entries.body`). The dashboard's CMS edit form embeds this; the
// HTML-emitting RichTextEditor in @sparx/ui stays available for places
// where HTML output is convenient (email composer, support replies).

import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import {
  Bold,
  Code as CodeIcon,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { cn } from '@sparx/ui';
import { cmsEditorExtensions, emptyDoc } from './extensions.js';
import type { JSONContent } from '@tiptap/react';

export type CmsDoc = Record<string, unknown>;

export interface ContentBlockEditorProps {
  value?: CmsDoc;
  onChange?: (doc: CmsDoc) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
        'disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'bg-[var(--module-active-tint)] text-[var(--module-active-text)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]',
      )}
    >
      {children}
    </button>
  );
}

function ToolDivider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-[var(--color-border-default)]" />;
}

export function ContentBlockEditor({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  ariaLabel = 'Content editor',
}: ContentBlockEditorProps) {
  const editor = useEditor({
    extensions: cmsEditorExtensions({ placeholder }),
    content: (value ?? emptyDoc()) as JSONContent,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getJSON());
    },
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: cn(
          'min-h-[12rem] w-full px-3 py-2 text-sm text-[var(--color-text-primary)]',
          'focus:outline-none',
          'prose-headings:font-medium prose-headings:text-[var(--color-text-primary)]',
          '[&_h2]:mt-4 [&_h3]:mt-3 [&_p]:my-2',
          '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
          '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border-default)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--color-text-secondary)]',
          '[&_code]:rounded [&_code]:bg-[var(--color-bg-subtle)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
          '[&_pre]:my-2 [&_pre]:rounded-md [&_pre]:bg-[var(--color-bg-subtle)] [&_pre]:p-3 [&_pre]:text-xs',
        ),
      },
    },
  });

  React.useEffect(() => {
    if (!editor || !value) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(value)) {
      editor.commands.setContent(value as JSONContent, { emitUpdate: false });
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

  return (
    <div
      className={cn(
        'rounded-md border bg-[var(--color-bg-surface)]',
        'border-[var(--color-border-default)] focus-within:border-[var(--color-border-focus)]',
        'focus-within:ring-2 focus-within:ring-[var(--color-border-focus)] focus-within:ring-offset-2',
        'transition-colors duration-150',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border-default)] p-1"
      >
        <ToolButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <CodeIcon className="h-3.5 w-3.5" />
        </ToolButton>

        <ToolDivider />

        <ToolButton label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-3.5 w-3.5" />
        </ToolButton>

        <ToolDivider />

        <ToolButton label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-3.5 w-3.5" />
        </ToolButton>

        <ToolDivider />

        <ToolButton label="Link" active={editor.isActive('link')} onClick={setLink}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolButton>

        <span className="ml-auto flex items-center gap-0.5">
          <ToolButton label="Undo" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Redo" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 className="h-3.5 w-3.5" />
          </ToolButton>
        </span>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
ContentBlockEditor.displayName = 'ContentBlockEditor';
