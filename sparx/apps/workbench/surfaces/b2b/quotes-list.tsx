'use client';

// Quotes — what a business asked a job or a bulk order would cost.
//
// A quote lands here when a trade customer asks for a price. You open it to price
// the lines and move it along; they accept or decline. This list is the queue you
// scan: who asked, for how much, and where each one stands right now. Pricing and
// responding happen in the quote itself (the invoicing editor it opens into),
// because a quote IS a billing document under the hood.

import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Table, Text } from '@wizeworks/silicaui-react';
import { FileText, X } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  formatDate,
  formatMoney,
  isExpired,
  quoteParty,
  quoteTone,
  useQuotes,
  type QuoteRow,
} from './quotes-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function QuotesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const accountId = typeof ctx.params.accountId === 'string' ? ctx.params.accountId : undefined;
  const accountName =
    typeof ctx.params.accountName === 'string' ? ctx.params.accountName : undefined;

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useQuotes({
    accountId,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  const open = (quote: QuoteRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('b2b.quote.detail', { id: quote.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Quote controls"
        status={<Text className="text-sm font-medium">Quotes</Text>}
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      {accountId && accountName ? (
        <div className="flex items-center gap-2">
          <Badge color="module" variant="soft">
            {accountName}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            onClick={() => {
              ctx.open('b2b.quotes.list', {}, { target: 'replace' });
            }}
          >
            <X className="size-4" aria-hidden />
            Show all quotes
          </Button>
        </div>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<FileText className="size-6" aria-hidden />}
            title="Could not load your quotes"
            description="This is a problem reaching the server. Your quotes are unaffected — nothing has been lost."
          />
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading quotes…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-6" aria-hidden />}
            title="No quotes yet"
            description={
              accountName
                ? `${accountName} hasn't asked for a quote yet. When they do, it'll show up here for you to price.`
                : 'When a business asks what a job or a bulk order would cost, the request shows up here for you to price up and send back.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Quote</th>
                <th className="hidden @lg:table-cell">Business</th>
                <th className="hidden text-sm @2xl:table-cell">Valid until</th>
                <th className="hidden text-right @xl:table-cell">Total</th>
                <th className="text-right">Standing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((quote) => {
                const expired = isExpired(quote) && quote.stage.stageType === 'draft';
                return (
                  <tr
                    key={quote.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(quote, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(quote, event);
                    }}
                  >
                    <td className="font-mono text-sm">{quote.number ?? 'Draft'}</td>
                    <td className="hidden max-w-48 truncate @lg:table-cell">{quoteParty(quote)}</td>
                    <td className="hidden text-sm @2xl:table-cell">
                      {formatDate(quote.validUntil)}
                    </td>
                    <td className="hidden text-right font-medium tabular-nums @xl:table-cell">
                      {formatMoney(quote.total, quote.currency)}
                    </td>
                    <td className="text-right">
                      {expired ? (
                        <Badge color="warning" variant="soft" size="sm">
                          Expired
                        </Badge>
                      ) : (
                        <Badge color={quoteTone(quote.stage.stageType)} variant="soft" size="sm">
                          {quote.stage.name}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="shrink-0">
        <ListPagination
          shown={rows.length}
          firstRow={rows.length === 0 ? 0 : skip + 1}
          total={total}
          page={page}
          pageSize={pageSize}
          canLoadMore={take < MAX_TAKE}
          busy={isFetching}
          onLoadMore={() => {
            setTake((current) => Math.min(current + pageSize, MAX_TAKE));
          }}
          onPageChange={(next) => {
            setPage(next);
            setTake(pageSize);
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
        <RowOpenHint />
      </div>
    </div>
  );
}
