import { describe, expect, it } from 'vitest';
import { draftProblem, emptyDraft } from './webhook-draft';

function draft(patch: Partial<ReturnType<typeof emptyDraft>>) {
  return {
    ...emptyDraft(),
    name: 'Tell our stock page',
    url: 'https://stock.example.co.uk/hooks',
    events: new Set(['content.entry.published']),
    ...patch,
  };
}

describe('draftProblem', () => {
  it('is happy with a complete draft', () => {
    expect(draftProblem(draft({}))).toBeNull();
  });

  it('asks for a name before anything else', () => {
    expect(draftProblem(draft({ name: '  ' }))).toContain('short name');
  });

  // The server caps the name at 120 and answers a longer one with Zod's own
  // report, which the console correctly refuses to show — so the refusal said
  // "Nothing was changed" and named no cause (issue 405, found on screen).
  it('refuses a name past the server limit, and says the limit', () => {
    const problem = draftProblem(draft({ name: 'x'.repeat(121) }));
    expect(problem).toContain('120');
  });

  it('accepts a name exactly at the limit', () => {
    expect(draftProblem(draft({ name: 'x'.repeat(120) }))).toBeNull();
  });

  it('reports the address problem in the address’s own words', () => {
    expect(draftProblem(draft({ url: 'http://example.com/x' }))).toContain('https://');
  });

  it('asks for at least one event last', () => {
    expect(draftProblem(draft({ events: new Set() }))).toContain('at least one');
  });
});
