import { redirect } from 'next/navigation';

// Retired (docs/33): the Theme inspector merged into the Brand & Theme center at
// /sitebuilder/brand. Kept as a redirect so old links/bookmarks (and the legacy
// nav entry, until it's removed from the manifest) resolve to the new surface.
export default function DesignPage() {
  redirect('/sitebuilder/brand');
}
