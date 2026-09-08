// The words for how money moved.
//
// Four panes named the same thing and disagreed: a cheque read "Check" on an
// invoice and "Cheque" on an order, a transfer was "Wire" in one place and
// "Bank transfer" in two others, and `ach` read "Bank transfer (ACH)" — US bank
// jargon on a screen for people who have never heard it.

/** One word per way money moves, whatever column it came out of. */
const MONEY_WORDS: Record<string, string> = {
  cash: 'Cash',
  // What the order form writes when the shopkeeper picks Cash — a cheque and a
  // transfer have their own values, so nothing else lands here (issue 044).
  manual: 'Cash',
  check: 'Cheque',
  ach: 'Bank transfer',
  // Kept apart from `ach` because a distributor settling by wire means the
  // same-day, fee-bearing one, and the two sit in the same menu on a B2B invoice.
  //
  // It is also the ONLY transfer the order endpoint accepts — its processor enum
  // is `stripe|paypal|manual|check|wire|net_terms` — so on an order this is what
  // "she paid it into my account" is stored as, and the word has to carry that
  // reading too. "Wire transfer" is ordinary English and true of both.
  wire: 'Wire transfer',
  card: 'Card',
  credit_card: 'Card',
  stripe: 'Card',
  sparx_pay: 'Card',
  square: 'Card (Square)',
  paypal: 'PayPal',
  net_terms: 'On account',
  account_credit: 'Account credit',
  // Money the shop was paid when the card was BOUGHT, now being spent. Recorded
  // as a payment rather than a discount, so this is a way money arrived.
  gift_card: 'Gift card',
  other: 'Other',
};

/**
 * How the money moved, in words, for any stored value.
 *
 * Falls back to the value with its underscores opened out rather than to a fixed
 * "Other" — a method nobody listed still reads as itself instead of vanishing
 * into a bucket that means something different.
 */
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return 'Other';
  return MONEY_WORDS[method] ?? method.replace(/_/g, ' ');
}

/** The words for a fixed set of values — for a menu, or a lookup table a pane
 *  already holds. Order is the caller's; this only supplies the words. */
export function paymentMethodLabels<K extends string>(methods: readonly K[]): Record<K, string> {
  return Object.fromEntries(methods.map((m) => [m, paymentMethodLabel(m)])) as Record<K, string>;
}
