// Deterministic slugify — lowercase, ascii letters/digits/dashes only, no
// leading/trailing dashes, capped at 255 chars (matching the column width).
// Used when a route generates a slug from a title (e.g. POST /v1/content/
// entries with no slug supplied) and as a normalizer when a slug is given.

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
}

// Returns the next free slug variant given a probe (`tx.entry.findFirst` etc).
// Picks `base`, `base-2`, `base-3`, … until the probe returns null. Used by
// the entry-create flow so collisions don't 409 the caller.

export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  let candidate = base;
  let n = 2;
  while (await exists(candidate)) {
    candidate = `${base}-${n++}`;
    if (n > 1000) throw new Error('uniqueSlug: too many collisions');
  }
  return candidate;
}
