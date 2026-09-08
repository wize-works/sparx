import { describe, expect, it } from 'vitest';
import {
  applicableProfileIds,
  dominantProfileId,
  offerableRates,
  profileForItem,
  profilePresenceFor,
} from './shipping-profile-match';

const COATS = 'coats';
const STANDARD = 'standard';

function rate(profileId: string, amountCents: number, name = 'Delivery') {
  return { profileId, amountCents, name };
}

describe('profileForItem', () => {
  it('lets the variant beat the product', () => {
    expect(profileForItem({ variantProfileId: COATS, productProfileId: 'other' })).toBe(COATS);
  });

  it('falls to the product, then to a collection', () => {
    expect(profileForItem({ productProfileId: COATS })).toBe(COATS);
    expect(profileForItem({ collectionProfileIds: [COATS] })).toBe(COATS);
  });

  it('picks the same collection every time when two of them claim the item', () => {
    const links = { collectionProfileIds: ['zeta', 'alpha'] };
    expect(profileForItem(links)).toBe('alpha');
    expect(profileForItem(links)).toBe(profileForItem(links));
  });

  it('says nothing rather than guessing when an item has no links', () => {
    expect(profileForItem({})).toBeNull();
    expect(profileForItem({ variantProfileId: null, productProfileId: null })).toBeNull();
  });
});

describe('profilePresenceFor', () => {
  it('reports an ordinary basket as ungrouped', () => {
    const presence = profilePresenceFor([{}, {}]);
    expect(presence.ungrouped).toBe(true);
    expect(presence.explicit.size).toBe(0);
  });

  it('reports a mixed basket as both', () => {
    const presence = profilePresenceFor([{ productProfileId: COATS }, {}]);
    expect([...presence.explicit]).toEqual([COATS]);
    expect(presence.ungrouped).toBe(true);
  });

  // An empty basket is not an ungrouped one. Nothing is in it, so nothing
  // claims the fallback.
  it('does not treat an empty basket as ordinary goods', () => {
    expect(profilePresenceFor([]).ungrouped).toBe(false);
  });
});

describe('applicableProfileIds', () => {
  it('prices an unknown parcel as ordinary goods, not as freight', () => {
    // No presence = the caller could not say what is in the box. Offering the
    // bulky surcharge there would charge a shopper for a box nobody looked at.
    expect([...applicableProfileIds(undefined, STANDARD)]).toEqual([STANDARD]);
  });

  it('brings in the fallback only when something is actually ungrouped', () => {
    const grouped = profilePresenceFor([{ productProfileId: COATS }]);
    expect([...applicableProfileIds(grouped, STANDARD)]).toEqual([COATS]);
  });

  // The trap this rule fell into on its first run, caught on the screen rather
  // than by a test: the fallback used to be "the group with no members", and
  // the minute an owner adds a second group there are TWO of those. A
  // brand-new, empty "Coats" group became the fallback for a basket of
  // scarves, and the dearer-group rule then priced the scarves as coats. The
  // fallback is now exactly ONE group — the shop's oldest — so a second empty
  // group can never quietly become the default.
  it('takes exactly one fallback, so a new empty group cannot become the default', () => {
    const ordinary = profilePresenceFor([{}, {}]);
    expect([...applicableProfileIds(ordinary, STANDARD)]).toEqual([STANDARD]);
  });

  it('has no fallback to reach for when the shop has no groups at all', () => {
    expect([...applicableProfileIds(profilePresenceFor([{}]), null)]).toEqual([]);
  });
});

describe('dominantProfileId', () => {
  it('picks the group that costs the most to send', () => {
    expect(dominantProfileId([rate(STANDARD, 900), rate(COATS, 2500)])).toBe(COATS);
  });

  it('compares groups on their CHEAPEST option, which is what a shopper pays', () => {
    // Standard has a dear express option; its floor is still $9, and a basket
    // of ordinary goods should not be priced as coats because express exists.
    const winner = dominantProfileId([
      rate(STANDARD, 900),
      rate(STANDARD, 4000, 'Express'),
      rate(COATS, 2500),
    ]);
    expect(winner).toBe(COATS);
  });

  it('says nothing when no rate quoted', () => {
    expect(dominantProfileId([])).toBeNull();
  });
});

describe('offerableRates', () => {
  // The defect this file exists for, in her own basket: a scarf, a shirt and a
  // knit, none of them in the coats group, and checkout offered "Coat delivery
  // — $25.00" anyway.
  it('never offers a group nothing in the basket belongs to', () => {
    const ordinary = profilePresenceFor([{}, {}, {}]);
    const offered = offerableRates(
      [rate(STANDARD, 0), rate(COATS, 2500, 'Coat delivery')],
      ordinary,
      STANDARD
    );
    expect(offered.map((r) => r.name)).toEqual(['Delivery']);
  });

  it('offers the coat price for a basket of coats, and not the standard one', () => {
    const coats = profilePresenceFor([{ productProfileId: COATS }]);
    const offered = offerableRates([rate(STANDARD, 0), rate(COATS, 2500)], coats, STANDARD);
    expect(offered).toEqual([rate(COATS, 2500)]);
  });

  it('prices a mixed basket by the dearer group — one box, strictest handling', () => {
    const mixed = profilePresenceFor([{ productProfileId: COATS }, {}]);
    const offered = offerableRates([rate(STANDARD, 900), rate(COATS, 2500)], mixed, STANDARD);
    expect(offered).toEqual([rate(COATS, 2500)]);
  });

  it('keeps every option of the winning group, not just its cheapest', () => {
    const coats = profilePresenceFor([{ productProfileId: COATS }]);
    const offered = offerableRates(
      [rate(COATS, 2500), rate(COATS, 5000, 'Coat express'), rate(STANDARD, 900)],
      coats,
      STANDARD
    );
    expect(offered.map((r) => r.name).sort()).toEqual(['Coat express', 'Delivery']);
  });

  it('offers nothing rather than something wrong when no group matches', () => {
    const coats = profilePresenceFor([{ productProfileId: 'gone' }]);
    expect(offerableRates([rate(STANDARD, 900)], coats, STANDARD)).toEqual([]);
  });

  it('a shop with one group is unaffected, which is nearly every shop', () => {
    const ordinary = profilePresenceFor([{}, {}]);
    const offered = offerableRates(
      [rate(STANDARD, 900), rate(STANDARD, 4000, 'Express')],
      ordinary,
      STANDARD
    );
    expect(offered).toHaveLength(2);
  });
});
