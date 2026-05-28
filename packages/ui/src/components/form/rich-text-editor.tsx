'use client';

import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
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
import { cn } from '../../utils/cn';

// TipTap-based rich text editor with a Sparx-styled toolbar. Controlled via
// `value` (HTML string) + `onChange`. StarterKit gives us paragraph/headings/
// lists/blockquote/code-block/bold/italic/strike/hr/history; we add Link and
// Placeholder. Active marks tint with --module-active.

export interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Aria-label on the editable region. */
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
      onMouseDown={(e) => e.preventDefault()} // keep editor focus
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
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

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing…',
  disabled,
  className,
  ariaLabel = 'Rich text editor',
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // StarterKit ships with a built-in Link extension in newer versions;
        // we replace with our configured one below.
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-[var(--sparx-primary)] underline underline-offset-2',
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value ?? '',
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: cn(
          'min-h-[8rem] w-full px-3 py-2 text-sm text-[var(--color-text-primary)]',
          'focus:outline-none',
          'prose-headings:font-medium prose-headings:text-[var(--color-text-primary)]',
          '[&_h2]:mt-4 [&_h3]:mt-3 [&_p]:my-2',
          '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
          '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border-default)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--color-text-secondary)]',
          '[&_code]:rounded [&_code]:bg-[var(--color-bg-subtle)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
          '[&_pre]:my-2 [&_pre]:rounded-md [&_pre]:bg-[var(--color-bg-subtle)] [&_pre]:p-3 [&_pre]:text-xs'
        ),
      },
    },
  });

  // Keep editor content in sync if value is updated externally (e.g. form reset).
  React.useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== undefined && value !== current) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  const setLink = () => {
    const previous = (editor.getAttributes('link') as { href?: string }).href ?? '';
    const next = window.prompt('Link URL', previous);
    if (next === null) return; // cancelled
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
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          disabled={!editor.can().chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Code"
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive('code')}
        >
          <CodeIcon className="h-3.5 w-3.5" />
        </ToolButton>

        <ToolDivider />

        <ToolButton
          label="Heading 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Heading 3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolButton>

        <ToolDivider />

        <ToolButton
          label="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
        >
          <List className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Ordered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Blockquote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolButton>

        <ToolDivider />

        <ToolButton label="Link" onClick={setLink} active={editor.isActive('link')}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolButton>

        <span className="ml-auto flex items-center gap-0.5">
          <ToolButton
            label="Undo"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().chain().focus().undo().run()}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            label="Redo"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().chain().focus().redo().run()}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </ToolButton>
        </span>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
RichTextEditor.displayName = 'RichTextEditor';
