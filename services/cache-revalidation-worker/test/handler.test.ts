import { describe, expect, it } from 'vitest';

import { planRevalidation } from '../src/handler.js';

describe('planRevalidation', () => {
  it('maps catalog + review events to the commerce scope', () => {
    for (const type of [
      'product.created',
      'product.updated',
      'product.deleted',
      'variant.updated',
      'inventory.adjusted',
      'review.published',
    ]) {
      expect(planRevalidation(type)).toBe('commerce');
    }
  });

  it('maps content + redirect events to the content scope', () => {
    for (const type of [
      'content.entry.published',
      'content.entry.updated',
      'content.entry.unpublished',
      'content_type.upserted',
      'redirect.added',
    ]) {
      expect(planRevalidation(type)).toBe('content');
    }
  });

  it('maps Site Builder publish events to the site scope', () => {
    expect(planRevalidation('sitebuilder.published')).toBe('site');
    expect(planRevalidation('sitebuilder.rolled_back')).toBe('site');
  });

  it('returns null for events that touch no cached read', () => {
    for (const type of ['cart.updated', 'order.paid', 'email.send', 'media.uploaded']) {
      expect(planRevalidation(type)).toBeNull();
    }
  });
});
