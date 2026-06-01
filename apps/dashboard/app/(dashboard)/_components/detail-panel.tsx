'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
  ModuleProvider,
  Stack,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sparx/ui';
import { Maximize2, PanelRight, Square, X } from 'lucide-react';
import { CREATE_SENTINEL, findEntityType, parseDetailToken } from '../_shell/detail-registry';

// Client chrome for the dashboard detail view. The detail BODY is rendered
// server-side by the `@detail` parallel slot and passed in as `children`;
// this file only supplies the header (close / open-full-page / switch-mode)
// and decides the render target.
//
// `useDetailTarget()` parses the URL for `?drawer=type:id` / `?modal=type:id`.
// The drawer panel renders inline in the shell's `detail` split; the modal
// panel renders as an overlay. Mode is just a render target — both wrap the
// same server-rendered body.

export interface DetailTarget {
  mode: 'drawer' | 'modal';
  typeId: string;
  entityId: string;
}

// Read the current detail target from the URL. Returns null when no
// detail is open. `modal` overrides `drawer` if both are present.
export function useDetailTarget(): DetailTarget | null {
  const params = useSearchParams();
  const modal = parseDetailToken(params?.get('modal'));
  if (modal) return { mode: 'modal', ...modal };
  const drawer = parseDetailToken(params?.get('drawer'));
  if (drawer) return { mode: 'drawer', ...drawer };
  return null;
}

// Imperative helper to construct a detail URL given (mode, type, id).
export function buildDetailHref(
  pathname: string,
  searchParams: URLSearchParams,
  target: DetailTarget | null
): string {
  const next = new URLSearchParams(searchParams);
  next.delete('drawer');
  next.delete('modal');
  if (target) {
    next.set(target.mode, `${target.typeId}:${target.entityId}`);
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

// ── Inline (drawer) renderer ───────────────────────────────

interface InlineDetailProps {
  target: DetailTarget;
  /** Server-rendered detail body from the `@detail` slot. */
  children: React.ReactNode;
}

export function InlineDetailContent({ target, children }: InlineDetailProps) {
  return (
    <Stack gap={0} className="h-full">
      <DetailHeader target={target} />
      <div className="flex-1 overflow-y-auto p-6">{children}</div>
    </Stack>
  );
}

// ── Modal renderer ─────────────────────────────────────────

interface ModalDetailProps {
  target: DetailTarget;
  onClose: () => void;
  /** Server-rendered detail body from the `@detail` slot. */
  children: React.ReactNode;
}

export function ModalDetailContent({ target, onClose, children }: ModalDetailProps) {
  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-h-[88vh] w-[min(1200px,94vw)] max-w-[min(1200px,94vw)] overflow-hidden p-0">
        <ModalTitle className="sr-only">{describeTarget(target)}</ModalTitle>
        <ModalDescription className="sr-only">
          Detail view for {describeTarget(target)}
        </ModalDescription>
        <Stack gap={0} className="max-h-[88vh]">
          <DetailHeader target={target} />
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
        </Stack>
      </ModalContent>
    </Modal>
  );
}

function describeTarget(target: DetailTarget): string {
  const found = findEntityType(target.typeId);
  const label = found?.entityType.label ?? target.typeId;
  return target.entityId === CREATE_SENTINEL ? `New ${label.toLowerCase()}` : label;
}

// ── Shared header chrome ───────────────────────────────────

function DetailHeader({ target }: { target: DetailTarget }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const found = findEntityType(target.typeId);
  if (!found) return null;
  const { entityType, manifest } = found;
  const fullPageHref = `${entityType.routePrefix}/${target.entityId}`;

  function close() {
    const next = new URLSearchParams(searchParams ?? '');
    next.delete('drawer');
    next.delete('modal');
    const qs = next.toString();
    router.replace(qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }

  function switchMode() {
    const next = new URLSearchParams(searchParams ?? '');
    const nextMode: 'drawer' | 'modal' = target.mode === 'drawer' ? 'modal' : 'drawer';
    next.delete('drawer');
    next.delete('modal');
    next.set(nextMode, `${target.typeId}:${target.entityId}`);
    router.replace(`${window.location.pathname}?${next.toString()}`);
  }

  const SwitchIcon = target.mode === 'drawer' ? Square : PanelRight;
  const switchLabel = target.mode === 'drawer' ? 'Switch to modal' : 'Switch to drawer';

  return (
    <ModuleProvider module={manifest.id}>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Close" onClick={close}>
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Open in full page" asChild>
              <Link href={fullPageHref}>
                <Maximize2 className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in full page</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={switchLabel} onClick={switchMode}>
              <SwitchIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{switchLabel}</TooltipContent>
        </Tooltip>

        <div className="flex-1" />
      </div>
    </ModuleProvider>
  );
}
