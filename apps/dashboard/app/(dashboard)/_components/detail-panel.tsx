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
  Spinner,
  Stack,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sparx/ui';
import { Maximize2, PanelRight, Square, X } from 'lucide-react';
import { findEntityType, getDetailComponentLoader } from '../_shell/detail-registry';

// Parses the URL for `?drawer=type:id` or `?modal=type:id`. The drawer
// panel renders inline in the shell's `detail` slot (composed by
// DashboardShell). The modal panel renders as an overlay here.
//
// Both modes load the SAME `_content.tsx` component for the entity type
// via the detail-registry. Mode is just a render target.

export interface DetailTarget {
  mode: 'drawer' | 'modal';
  typeId: string;
  entityId: string;
}

// Read the current detail target from the URL. Returns null when no
// detail is open. `modal` overrides `drawer` if both are present.
export function useDetailTarget(): DetailTarget | null {
  const params = useSearchParams();
  const modal = params?.get('modal');
  if (modal) {
    const parsed = parseTarget(modal);
    if (parsed) return { mode: 'modal', ...parsed };
  }
  const drawer = params?.get('drawer');
  if (drawer) {
    const parsed = parseTarget(drawer);
    if (parsed) return { mode: 'drawer', ...parsed };
  }
  return null;
}

function parseTarget(raw: string): { typeId: string; entityId: string } | null {
  const idx = raw.indexOf(':');
  if (idx < 1 || idx === raw.length - 1) return null;
  return { typeId: raw.slice(0, idx), entityId: raw.slice(idx + 1) };
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
}

export function InlineDetailContent({ target }: InlineDetailProps) {
  return (
    <Stack gap={0} className="h-full">
      <DetailHeader target={target} />
      <div className="flex-1 overflow-y-auto p-6">
        <React.Suspense fallback={<DetailLoading />}>
          <DetailBody target={target} />
        </React.Suspense>
      </div>
    </Stack>
  );
}

// ── Modal renderer ─────────────────────────────────────────

interface ModalDetailProps {
  target: DetailTarget;
  onClose: () => void;
}

export function ModalDetailContent({ target, onClose }: ModalDetailProps) {
  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-h-[85vh] w-[min(900px,90vw)] overflow-hidden p-0">
        <ModalTitle className="sr-only">{describeTarget(target)}</ModalTitle>
        <ModalDescription className="sr-only">
          Detail view for {describeTarget(target)}
        </ModalDescription>
        <Stack gap={0} className="max-h-[85vh]">
          <DetailHeader target={target} />
          <div className="flex-1 overflow-y-auto p-6">
            <React.Suspense fallback={<DetailLoading />}>
              <DetailBody target={target} />
            </React.Suspense>
          </div>
        </Stack>
      </ModalContent>
    </Modal>
  );
}

function describeTarget(target: DetailTarget): string {
  const found = findEntityType(target.typeId);
  return found?.entityType.label ?? target.typeId;
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

// ── Body loader ────────────────────────────────────────────

interface DetailBodyProps {
  target: DetailTarget;
}

function DetailBody({ target }: DetailBodyProps) {
  // Hook must run unconditionally (rules-of-hooks). Loader is looked up
  // every render — the registry returns the same reference for the same
  // typeId, so React.lazy memoization holds.
  const loader = getDetailComponentLoader(target.typeId);
  const Lazy = React.useMemo(() => (loader ? React.lazy(loader) : null), [loader]);
  if (!Lazy) {
    return (
      <Stack gap={2}>
        <strong>No detail component registered for type &quot;{target.typeId}&quot;.</strong>
      </Stack>
    );
  }
  return <Lazy id={target.entityId} />;
}

function DetailLoading() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Spinner />
    </div>
  );
}
