import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUpload } from './file-upload';

function mkFile(name: string, type: string, sizeBytes = 100): File {
  const bytes = new Uint8Array(sizeBytes);
  return new File([bytes], name, { type });
}

describe('FileUpload', () => {
  it('renders the drop zone instructions', () => {
    render(<FileUpload accept="image/*" />);
    expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
    expect(screen.getByText('image/*')).toBeInTheDocument();
  });

  it('adds accepted files and fires onFilesChange', async () => {
    const onFilesChange = vi.fn();
    render(<FileUpload accept="image/*" multiple onFilesChange={onFilesChange} />);

    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    const file = mkFile('logo.png', 'image/png');
    await userEvent.upload(input, file);

    expect(onFilesChange).toHaveBeenCalledWith([file]);
    expect(screen.getByText('logo.png')).toBeInTheDocument();
  });

  it('replaces the file when multiple={false}', async () => {
    const onFilesChange = vi.fn();
    render(<FileUpload multiple={false} onFilesChange={onFilesChange} />);

    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    await userEvent.upload(input, mkFile('a.txt', 'text/plain'));
    await userEvent.upload(input, mkFile('b.txt', 'text/plain'));

    // Last call should contain only the second file
    const lastArgs = onFilesChange.mock.calls.at(-1)![0] as File[];
    expect(lastArgs).toHaveLength(1);
    expect(lastArgs[0]!.name).toBe('b.txt');
  });

  it('rejects files that fail the maxSize check via onReject', async () => {
    const onReject = vi.fn();
    render(<FileUpload maxSize={50} onReject={onReject} />);

    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    await userEvent.upload(input, mkFile('big.bin', 'application/octet-stream', 100));

    expect(onReject).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'size' })
    );
  });

  it('removes a file via its remove button', async () => {
    const onFilesChange = vi.fn();
    render(<FileUpload multiple onFilesChange={onFilesChange} />);

    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    await userEvent.upload(input, mkFile('hello.txt', 'text/plain'));
    expect(screen.getByText('hello.txt')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /remove hello\.txt/i }));
    expect(screen.queryByText('hello.txt')).not.toBeInTheDocument();
    expect(onFilesChange).toHaveBeenLastCalledWith([]);
  });
});
