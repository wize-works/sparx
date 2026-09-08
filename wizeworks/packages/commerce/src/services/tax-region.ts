// Turning what a shopper TYPED into the region code a tax zone is filed under.
//
// These are two different vocabularies and nothing was translating between them.
// A delivery address carries free text up to 120 characters — "CA",
// "California", "calif." — while a tax zone is `US-CA` and the calculation
// request will not accept anything else. So every US order, whatever the shopper
// typed, matched no state zone.
//
// The rule is deliberately conservative. When this cannot say what state an
// address is in, it says NOTHING, and the calculation falls back to the
// country-level zone. Guessing would charge somebody the wrong state's rate,
// which is worse than charging none — a shop can find and fix an
// under-collection, and cannot un-charge a stranger.

/** US states, DC and the inhabited territories, by name. Codes are handled
 *  separately, so this holds only what somebody would TYPE OUT. */
const US_STATES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'puerto rico': 'PR',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
};

/** Canadian provinces and territories, by name. */
const CA_PROVINCES: Record<string, string> = {
  alberta: 'AB',
  'british columbia': 'BC',
  manitoba: 'MB',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  'northwest territories': 'NT',
  'nova scotia': 'NS',
  nunavut: 'NU',
  ontario: 'ON',
  'prince edward island': 'PE',
  quebec: 'QC',
  saskatchewan: 'SK',
  yukon: 'YT',
};

const BY_COUNTRY: Record<string, Record<string, string>> = {
  US: US_STATES,
  CA: CA_PROVINCES,
};

/**
 * The ISO 3166-2 code for a shipping address's region, or `undefined` when it
 * cannot be told.
 *
 * Accepts what people actually type: the code on its own (`CA`), the full name
 * (`California`, in any case, with any spacing), or the ISO code already
 * (`US-CA`). Anything else returns undefined rather than a guess.
 */
export function taxRegionCode(country: string, region?: string | null): string | undefined {
  const cc = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return undefined;

  const raw = (region ?? '').trim();
  if (raw === '') return undefined;

  // Already ISO, possibly for a DIFFERENT country. A mismatch is a contradiction
  // in the address rather than something to reconcile, so it is refused.
  // Spaces and full stops go first, so "D.C." reaches the code branch as "DC"
  // rather than falling through to the name table, which lists it spelled out.
  const iso = raw.toUpperCase().replace(/[\s.]/g, '');
  const isoMatch = /^([A-Z]{2})-([A-Z0-9]{1,3})$/.exec(iso);
  if (isoMatch) return isoMatch[1] === cc ? iso : undefined;

  // A bare code: "CA", "NY", "ON". Two or three characters, no spaces.
  if (/^[A-Z0-9]{2,3}$/.test(iso)) return `${cc}-${iso}`;

  // A name. Collapse the whitespace, drop punctuation people add.
  const name = raw.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
  const code = BY_COUNTRY[cc]?.[name];
  return code ? `${cc}-${code}` : undefined;
}
