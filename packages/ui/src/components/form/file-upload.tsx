'use client';

import * as React from 'react';
import { File as FileIcon, Upload, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../primitives/button';

// Drag-and-drop file upload. Uncontrolled list of staged files lives in state;
// `onFilesChange` fires on every add/remove so consumers can sync with their
// own model (form field, upload queue, etc.).

export interface FileUploadProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** MIME types or extensions, e.g. ['image/*', '.pdf']. */
  accept?: string;
  multiple?: boolean;
  /** Max bytes per file. Rejected files surface via onReject. */
  maxSize?: number;
  disabled?: boolean;
  /** Fires on every change to the selected file list (additions or removals). */
  onFilesChange?: (files: File[]) => void;
  /** Called when a file fails accept/maxSize checks. */
  onReject?: (rejection: { file: File; reason: 'size' | 'type' }) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept) return true;
  const patterns = accept
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return patterns.some((p) => {
    if (p.startsWith('.')) return file.name.toLowerCase().endsWith(p.toLowerCase());
    if (p.endsWith('/*')) return file.type.startsWith(p.slice(0, -1));
    return file.type === p;
  });
}

export const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  (
    { className, accept, multiple = false, maxSize, disabled, onFilesChange, onReject, ...props },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [files, setFiles] = React.useState<File[]>([]);
    const [isDragging, setIsDragging] = React.useState(false);

    const addFiles = (incoming: FileList | File[]) => {
      const accepted: File[] = [];
      for (const file of Array.from(incoming)) {
        if (!matchesAccept(file, accept)) {
          onReject?.({ file, reason: 'type' });
          continue;
        }
        if (maxSize !== undefined && file.size > maxSize) {
          onReject?.({ file, reason: 'size' });
          continue;
        }
        accepted.push(file);
      }
      if (accepted.length === 0) return;
      const next = multiple ? [...files, ...accepted] : accepted.slice(0, 1);
      setFiles(next);
      onFilesChange?.(next);
    };

    const removeFile = (index: number) => {
      const next = files.filter((_, i) => i !== index);
      setFiles(next);
      onFilesChange?.(next);
    };

    const openPicker = () => {
      if (!disabled) inputRef.current?.click();
    };

    return (
      <div ref={ref} className={cn('flex flex-col gap-2', className)} {...props}>
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled ? true : undefined}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            if (disabled) return;
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            if (disabled) return;
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed',
            'px-6 py-8 text-center text-sm',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
            isDragging
              ? 'border-[var(--module-active)] bg-[var(--module-active-tint)] text-[var(--module-active-text)]'
              : 'border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]',
            disabled && 'pointer-events-none opacity-50'
          )}
        >
          <Upload className="h-5 w-5" />
          <p>
            <span className="font-medium text-[var(--color-text-primary)]">Click to upload</span>
            {' or drag and drop'}
          </p>
          {accept && <p className="text-xs text-[var(--color-text-tertiary)]">{accept}</p>}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = ''; // allow re-selecting the same file
          }}
        />

        {files.length > 0 && (
          <ul className="flex flex-col gap-1">
            {files.map((file, idx) => (
              <li
                key={`${file.name}-${idx}`}
                className="flex items-center gap-2 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2.5 py-1.5 text-sm"
              >
                <FileIcon className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
                <span className="flex-1 truncate text-[var(--color-text-primary)]">
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-[var(--color-text-tertiary)]">
                  {formatSize(file.size)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeFile(idx)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);
FileUpload.displayName = 'FileUpload';
