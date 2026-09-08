// Money and enquiries — what a business most wants another system to hear.

import type { WebhookEventDef } from './types';

export const SELLING_EVENTS: readonly WebhookEventDef[] = [
  {
    key: 'order.paid',
    label: 'Order paid',
    description:
      'Somebody has paid for an order. The money is on its way to you and the order is ready to be filled. This is the one most people are here for.',
    group: 'Selling',
  },
  {
    key: 'payment.captured',
    label: 'Payment taken',
    description:
      'A card payment goes through. On an ordinary order this happens at the same moment as the one above; on a deposit or a later charge it does not, which is why both exist.',
    group: 'Selling',
  },
  {
    key: 'payment.failed',
    label: 'Payment failed',
    description:
      'A card payment was declined or could not be taken. Worth watching — a run of these is money you are not getting.',
    group: 'Selling',
  },
  {
    key: 'form.submitted',
    label: 'Form filled in',
    description:
      'Somebody fills in a form on your site — a contact page, an enquiry, a trade application.',
    group: 'Selling',
  },
];
