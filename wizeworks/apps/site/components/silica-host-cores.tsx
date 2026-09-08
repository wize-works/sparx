// The storefront's map of pinned-core key → real interactive component (docs/122).
// silica lowers a `kind:"host"` node to an empty `<div data-sui-host="<key>">`; the
// React walk (`SilicaFunctionalBody`) mounts the component this registry returns at
// that node, so a tenant's editable shell wraps the LIVE transaction, never a mock.
//
// This is the site half of the contract whose keys live in @wizeworks/silica-catalog
// (`HOST_KEYS`); the dashboard half maps the same keys to canvas skeletons. A key with
// no case here renders an empty wrapper — so an entry is added only once its real
// component is wired (never a palette core that renders nothing live).
//
// A server module (no 'use client'): it only RETURNS client-component elements, the
// standard RSC pattern — the walk runs server-side and each core hydrates as an island.

import { HOST_KEYS } from '@wizeworks/silica-catalog';
import type { HostNode } from '@wizeworks/silicaui-html';
import type { HostRenderer } from '@/components/silica-chrome';

import { CartView } from '@/components/cart-view';
import { SearchExperience, type SearchParams } from '@/components/search/search-experience';
import { ProductListing } from '@/components/products/product-listing';
import { CollectionIndex } from '@/components/collections/collection-index';
import { CollectionDetail } from '@/components/collections/collection-detail';
import { CategoryIndex } from '@/components/category/category-index';
import { CategoryDetail } from '@/components/category/category-detail';
import { BookingServices, toHeadingText } from '@/components/booking/booking-services';
import { BookingServiceDetail } from '@/components/booking/booking-service-detail';
import { ProductReviewsCore } from '@/components/products/product-reviews-core';
import { ProductQuestionsCore } from '@/components/products/product-questions-core';
import { AccountAuth, toAuthMode } from '@/components/account/account-auth';
import { AccountLink } from '@/components/account/account-link';
import { SiteBrand, toBrandShow } from '@/components/brand/site-brand';
import { ArticleBody } from '@/components/cms/article-body';
import { ModeToggle } from '@/components/mode-toggle';
import { LegalFooterLinks, toLegalHeading } from '@/components/legal-footer-links';
import { SocialLinks } from '@wizeworks/builder-render';
import { ListPagination, type ListPagingFacts } from '@/components/list-pagination';
import { SiteEmbed } from '@/components/embed/site-embed';
import { SiteMap } from '@/components/embed/site-map';
import { mediaUrl } from '@/lib/media';
import type { LegalLink } from '@/lib/legal';
import type { ResolvedSite } from '@/lib/site-context';

/** Route-supplied context a core may need beyond its author-set `node.props` — the
 *  resolved site + route params the storefront already has in hand. A host node can't
 *  read the URL or resolve the tenant itself, so the route passes what its cores need;
 *  the context is a superset (each core reads only its slice — the cart needs nothing,
 *  search needs `searchParams`). */
export interface HostCoreContext {
  site: ResolvedSite;
  propertySlug?: string;
  /** The route's resolved URL search params — for cores whose state lives in the URL
   *  (search filters/sort/page). Absent for cores that don't read it. */
  searchParams?: SearchParams;
  /** The in-scope record's URL handle, for a per-record template whose core resolves by
   *  handle (the category-detail core). Absent for non-per-record cores. */
  recordHandle?: string;
  /** The in-scope record's id, for a per-record template whose core resolves by id (the
   *  booking-service-detail core). Absent for non-per-record cores. */
  recordId?: string;
  /** The in-scope CMS entry's rich-text doc, for the article-body core. Passed as DATA
   *  rather than fetched by the core because the route already holds the entry it
   *  resolved the template for — re-reading it here would be a second round trip for a
   *  document we have in hand. */
  articleDoc?: unknown;
  /** The tenant's appearance policy + the SSR-resolved initial theme. Lets the
   *  theme-toggle host mount the real cookie-backed switch — and render nothing unless
   *  the policy (`toggle`) actually offers both light and dark. */
  appearance?: { policy: string; initial: 'light' | 'dark' };
  /** The tenant's published legal-document placements, for the legal-links core.
   *  Passed as DATA rather than fetched by the core because the layout already reads
   *  them for the default footer — the silica frame and the default footer resolve the
   *  same list once, so the two chromes can never disagree about what is published. */
  legalLinks?: LegalLink[];
  /** What the route's data load actually paginated, for the pagination core. Passed as
   *  DATA rather than re-derived because only `buildSilicaHost` knows how many records
   *  there turned out to be — a core that guessed would eventually offer a page that
   *  is not there. Absent on a route with no bound list, which is the same as empty. */
  paging?: ListPagingFacts[];
  /** The route's own path, with no query string — the base every page link is built
   *  on. A host core cannot read the URL, and building links against the wrong path
   *  is how a pager on `/journal` sends readers to `/?page=2`. */
  basePath?: string;
  /** True only on `/book`, where the booking list IS what the page is about, so its
   *  heading is the page's `<h1>`. Everywhere else it is a section heading — the
   *  block is offered on every page, and it used to emit an `<h1>` wherever it
   *  landed (issue 095). */
  bookingHeadingIsPageTitle?: boolean;
}

/** Build the storefront `HostRenderer` for a route — a single switch over the pinned
 *  keys, closing over the route's context. Passed to `SilicaFunctionalBody`. This is a
 *  render CALLBACK invoked imperatively by the walk, not a React component (hence the
 *  lowercase name — it never appears in JSX as `<mountHostCore/>`). */
export function SiteHostRenderer(ctx: HostCoreContext): HostRenderer {
  return function mountHostCore(node: HostNode): React.ReactNode {
    switch (node.component) {
      case HOST_KEYS.commerceCart:
        // Cart state is client-side, so the basket needs nothing handed to it —
        // except the one thing it cannot know from the basket: whether this shop
        // takes money on this website at all (issue 185).
        return <CartView paymentMode={ctx.site.commerce.paymentMode} />;
      case HOST_KEYS.commerceSearch:
        return <SearchExperience site={ctx.site} searchParams={ctx.searchParams ?? {}} />;
      case HOST_KEYS.commercePlp:
        return <ProductListing site={ctx.site} searchParams={ctx.searchParams ?? {}} />;
      case HOST_KEYS.commerceCollections:
        return <CollectionIndex site={ctx.site} />;
      case HOST_KEYS.commerceCategories:
        return <CategoryIndex site={ctx.site} />;
      case HOST_KEYS.schedulingServices:
        // Self-contained for its DATA (resolves the tenant from the request host); its
        // words are the author's (issue 095).
        return (
          <BookingServices
            asPageTitle={ctx.bookingHeadingIsPageTitle ?? false}
            heading={toHeadingText(node.props?.heading, 'Book with us')}
            subheading={toHeadingText(
              node.props?.subheading,
              'Choose a service to see open times and reserve your spot.'
            )}
          />
        );
      case HOST_KEYS.commerceCategoryDetail:
        // Per-record: the route passes the category handle (+ facets/sort/page in searchParams).
        return (
          <CategoryDetail
            site={ctx.site}
            handle={ctx.recordHandle ?? ''}
            searchParams={ctx.searchParams}
          />
        );
      case HOST_KEYS.commerceCollectionDetail:
        // Per-record: the route passes the collection handle (+ facets/sort/page in searchParams).
        return (
          <CollectionDetail
            site={ctx.site}
            handle={ctx.recordHandle ?? ''}
            searchParams={ctx.searchParams}
          />
        );
      case HOST_KEYS.commerceProductReviews:
        // Per-record: the route passes the product handle, and the core fetches its
        // own reviews from it (a host core cannot read the URL). Author-tunable
        // words, because "Reviews" is not what every shop calls them.
        return (
          <ProductReviewsCore
            tenantSlug={ctx.site.slug}
            handle={ctx.recordHandle ?? ''}
            heading={toHeadingText(node.props?.heading, 'Reviews')}
            emptyText={toHeadingText(node.props?.emptyText, 'No reviews yet — be the first.')}
            showForm={node.props?.showForm !== false}
          />
        );
      case HOST_KEYS.commerceProductQuestions:
        // Per-record, exactly like reviews: the route passes the product handle and the
        // core fetches its own questions. Author-tunable words, because a shop that
        // calls this "Ask the maker" should be able to say so.
        return (
          <ProductQuestionsCore
            tenantSlug={ctx.site.slug}
            handle={ctx.recordHandle ?? ''}
            heading={toHeadingText(node.props?.heading, 'Questions')}
            emptyText={toHeadingText(node.props?.emptyText, 'No questions yet — ask us anything.')}
            showForm={node.props?.showForm !== false}
          />
        );
      case HOST_KEYS.schedulingServiceDetail:
        // Per-record: the route passes the service id.
        return <BookingServiceDetail serviceId={ctx.recordId ?? ''} />;
      case HOST_KEYS.commerceAuth:
        // Mode-parameterized: the composite/route bakes `mode` into the node's props
        // (signin | register | forgot | reset); the form reads its own URL params.
        return <AccountAuth mode={toAuthMode(node.props?.mode)} />;
      case HOST_KEYS.cmsArticleBody:
        // Per-record: the route passes the entry's doc. `node.class` is deliberately NOT
        // forwarded — the walk already puts it on the host wrapper this mounts inside, so
        // passing it again would apply the author's measure and padding twice (a max-w-3xl
        // inside a max-w-3xl, py-10 doubled). The brand core forwards it because it renders
        // an inline mark whose own sizing classes matter; a prose block just fills its shell.
        return <ArticleBody doc={ctx.articleDoc} />;
      case HOST_KEYS.siteThemeToggle:
        // The light/dark switch — mounted only when the site actually offers both themes
        // (appearance policy `toggle`). Any single-theme or device-follow policy renders
        // nothing, matching the default header's own gate. It flips `data-theme` + writes
        // the `sparx_theme` cookie the layout's no-flash script reads, so a silica-framed
        // site gets the same working toggle the default header has.
        return ctx.appearance?.policy === 'toggle' ? (
          <ModeToggle initial={ctx.appearance.initial} />
        ) : null;
      case HOST_KEYS.sitePagination:
        // Page links for a bound list on this page. Renders NOTHING unless the route
        // actually paginated something and there is more than one page — a pager that
        // invents a page 2 sends a reader to an empty grid.
        return (
          <ListPagination
            paging={ctx.paging ?? []}
            list={typeof node.props?.list === 'string' ? node.props.list : undefined}
            basePath={ctx.basePath ?? '/'}
            searchParams={ctx.searchParams ?? {}}
          />
        );
      case HOST_KEYS.siteAccountLink:
        // "Sign in" to a visitor, her own name once she is signed in. Needs no route
        // context — the chrome renders inside <CustomerProvider>, so the component reads
        // the live session. `node.class` is the block's own styling for THIS placement
        // (an inline link in the bar, a full-width button in the phone panel), so it is
        // passed through rather than replaced.
        return <AccountLink {...(node.class ? { className: node.class } : {})} />;
      case HOST_KEYS.siteLegalLinks:
        // The tenant's published legal pages, resolved from doc placements by the
        // layout. Renders nothing until at least one is published — which is why the
        // starter footer can stop hardcoding /privacy-policy and /terms-of-service.
        return (
          <LegalFooterLinks
            links={ctx.legalLinks ?? []}
            heading={toLegalHeading(node.props?.heading)}
          />
        );
      case HOST_KEYS.siteSocialLinks:
        // The business's own social accounts, straight off the resolved site — the
        // same list Site identity writes and the same one `site.social` carries, so
        // the two chromes can never disagree. Renders nothing until she adds one,
        // which is what lets the seed put the slot in every footer up front.
        return (
          <SocialLinks
            items={ctx.site.socials}
            {...(node.class ? { className: node.class } : {})}
          />
        );
      case HOST_KEYS.siteMap:
      case HOST_KEYS.siteEmbed:
        // Self-contained: the address or link is the author's own prop, so no route
        // context is threaded. Both render NOTHING while their field is empty or
        // unusable — the author hears about it on the canvas and in the pre-publish
        // check, never a visitor via an empty box. VIDEO is not here and should not be:
        // it is silicaui's own `Embed` component, stamped from the palette, because the
        // engine already frames YouTube and Vimeo properly.
        return node.component === HOST_KEYS.siteMap ? (
          <SiteMap props={node.props} />
        ) : (
          <SiteEmbed props={node.props} />
        );
      case HOST_KEYS.siteBrand:
        // The brand mark — resolved straight off the site the route already has, so the
        // header always reflects what's in Site settings right now. `show` is the
        // author's Inspector choice; `node.class` is their styling, which wins over the
        // component's default so the mark stays theirs to place.
        return (
          <SiteBrand
            name={ctx.site.name}
            logoUrl={mediaUrl(ctx.site.theme?.logoMediaId ?? null, ctx.site.slug)}
            logoDarkUrl={mediaUrl(ctx.site.theme?.logoDarkMediaId ?? null, ctx.site.slug)}
            show={toBrandShow(node.props?.show)}
            {...(node.class ? { className: node.class } : {})}
          />
        );
      default:
        return null;
    }
  };
}
