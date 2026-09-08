// Made to order — the shapes and the plain words for them (issue 026).
//
// A thing that has to be made before it can be handed over asks three questions
// nothing else on a product does: how long, how much now, how many a day. The
// sentences live here rather than in the section so the product editor, the
// order pane and any future summary all read the same.

/** How much of the price is taken up front. Three shapes, never four columns. */
export type ProductDeposit =
  { type: 'none' } | { type: 'amount'; amountCents: number } | { type: 'percent'; percent: number };

export const NO_DEPOSIT: ProductDeposit = { type: 'none' };

export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** How a notice period reads to the person setting it. */
export function noticeSentence(days: number | null): string {
  if (days === null) return 'People can buy this and take it away the same day.';
  if (days === 1) return 'Your website asks for one day, so nothing is due before tomorrow.';
  return `Your website asks for ${String(days)} days, so nothing is due before then.`;
}

/** How a deposit reads. Named in the shop's own terms, never "partial capture". */
export function depositSentence(deposit: ProductDeposit, currency = 'USD'): string {
  if (deposit.type === 'amount') {
    return `${money(deposit.amountCents, currency)} is paid when they order. The rest is paid when they collect.`;
  }
  if (deposit.type === 'percent') {
    return `${String(deposit.percent)}% is paid when they order. The rest is paid when they collect.`;
  }
  return 'The whole price is paid at checkout.';
}

/** How a daily allowance reads. */
export function limitSentence(limit: number | null): string {
  if (limit === null) return 'There is no daily limit.';
  if (limit === 1) return 'One a day. Once it is taken, your website offers the next day.';
  return `${String(limit)} a day. Once they are taken, your website offers the next day.`;
}

/** A date a person recognizes, from the `YYYY-MM-DD` the server sends. Parsed as
 *  a plain calendar date, never as an instant — reading it as UTC and printing
 *  it locally is how a Saturday becomes a Friday west of Greenwich. */
export function readyOnLabel(readyOn: string | null): string | null {
  if (!readyOn) return null;
  const [year, month, day] = readyOn.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
