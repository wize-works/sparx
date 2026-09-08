// The publish-date invariant (issue 376).
//
// `publishTimestamp` is small, and the reason it exists is not: three separate
// write paths shipped `status: 'published'` with no date, and NOTHING downstream
// said so. The public listing orders by `publishedAt desc`, Postgres puts NULLs
// FIRST on a descending sort, and the storefront card binds a pre-formatted date
// that comes out empty. So an undated post silently outranks every real one and
// wears a blank date line, while the console shows the same green Published badge
// as a healthy row. These tests pin the rule so the next write path inherits it.

import { describe, it, expect } from 'vitest';
import { publishTimestamp } from './entries-service.js';

const NOW = new Date('2026-09-01T10:00:00.000Z');
const EARLIER = new Date('2026-03-14T08:30:00.000Z');

describe('publishTimestamp', () => {
  describe('a row that says published always gets a date', () => {
    it('dates a fresh publish with the supplied clock', () => {
      expect(publishTimestamp('published', undefined, NOW)).toEqual(NOW);
    });

    it('dates a publish whose row has never been published', () => {
      expect(publishTimestamp('published', null, NOW)).toEqual(NOW);
    });

    it('never returns null for a published status', () => {
      for (const existing of [undefined, null, EARLIER]) {
        expect(publishTimestamp('published', existing, NOW)).not.toBeNull();
      }
    });

    it('defaults the clock rather than returning null when none is passed', () => {
      const before = Date.now();
      const at = publishTimestamp('published');
      expect(at).toBeInstanceOf(Date);
      expect(at!.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('an existing publish date is a fact about the post, not the edit', () => {
    it('keeps the original date when a live entry is written again', () => {
      expect(publishTimestamp('published', EARLIER, NOW)).toEqual(EARLIER);
    });

    it('keeps the original date when a live entry is taken back to draft', () => {
      expect(publishTimestamp('draft', EARLIER, NOW)).toEqual(EARLIER);
    });

    it('keeps the original date through scheduling', () => {
      expect(publishTimestamp('scheduled', EARLIER, NOW)).toEqual(EARLIER);
    });

    it('keeps the original date through archiving', () => {
      expect(publishTimestamp('archived', EARLIER, NOW)).toEqual(EARLIER);
    });
  });

  describe('a row that does not say published invents nothing', () => {
    it('leaves a new draft undated', () => {
      expect(publishTimestamp('draft', undefined, NOW)).toBeNull();
    });

    it('leaves a new scheduled entry undated', () => {
      expect(publishTimestamp('scheduled', null, NOW)).toBeNull();
    });

    it('leaves an unrecognized status undated rather than guessing', () => {
      expect(publishTimestamp('review', undefined, NOW)).toBeNull();
    });
  });

  describe('the three write paths that were getting it wrong', () => {
    // blueprint-installer: creates an entry straight from the manifest's status.
    it('dates a blueprint entry declared published at install', () => {
      expect(publishTimestamp('published', undefined, NOW)).toEqual(NOW);
    });

    // blueprint-installer: the same manifest with the default status.
    it('leaves a blueprint entry declared draft undated', () => {
      expect(publishTimestamp('draft', undefined, NOW)).toBeNull();
    });

    // blueprint-updater: an update carrying a draft → published transition.
    it('dates a blueprint update that takes a draft live', () => {
      expect(publishTimestamp('published', null, NOW)).toEqual(NOW);
    });

    // blueprint-updater: an edit to an entry that is already live.
    it('does not re-date a blueprint update to a live entry', () => {
      expect(publishTimestamp('published', EARLIER, NOW)).toEqual(EARLIER);
    });

    // graphql createEntry: `status: published` on a create.
    it('dates a graphql create that names published', () => {
      expect(publishTimestamp('published', undefined, NOW)).toEqual(NOW);
    });
  });

  it('is pure — the same inputs give the same answer', () => {
    const a = publishTimestamp('published', undefined, NOW);
    const b = publishTimestamp('published', undefined, NOW);
    expect(a).toEqual(b);
  });
});
