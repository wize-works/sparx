// Which location a count form opens on.
//
// The form used to open on `locations[0]`, which is the first place by NAME. A
// shop with a Fulfillment Center it has never used and a Main Warehouse holding
// every unit it owns was offered the Fulfillment Center every single time, and
// counting five versions of one shirt meant correcting it five times. Stock put
// in a building nobody uses is invisible to the shop that needs it.

import { describe, expect, it } from 'vitest';

import { pickCountLocation } from './count-location';

const MAIN = 'w-main';
const FC = 'w-fulfillment';
/** As the select shows them: by name, so the unused one sorts first. */
const OFFERED = [FC, MAIN];

describe('pickCountLocation', () => {
  it('uses where this version is already counted, over everything else', () => {
    expect(
      pickCountLocation({ here: [MAIN], nearby: [FC, FC, FC], remembered: FC, offered: OFFERED })
    ).toBe(MAIN);
  });

  it('uses where the rest of the product is, when nothing is remembered', () => {
    // Devi's case: a new colorway on a shirt whose other fifteen versions are
    // all in the Main Warehouse.
    expect(
      pickCountLocation({
        here: [],
        nearby: [MAIN, MAIN, MAIN],
        remembered: null,
        offered: OFFERED,
      })
    ).toBe(MAIN);
  });

  it('lets the place somebody chose beat the place the siblings are in', () => {
    // Somebody standing in the Fulfillment Center counting a delivery must not
    // be sent back to the Main Warehouse on the next version.
    expect(
      pickCountLocation({ here: [], nearby: [MAIN, MAIN], remembered: FC, offered: OFFERED })
    ).toBe(FC);
  });

  it('takes the commonest sibling place, not the first one seen', () => {
    expect(
      pickCountLocation({
        here: [],
        nearby: [FC, MAIN, MAIN],
        remembered: null,
        offered: OFFERED,
      })
    ).toBe(MAIN);
  });

  it('ignores a remembered place that is no longer on offer', () => {
    // A closed location, or one belonging to a different business. It must fall
    // through to the next rung rather than being returned as a location.
    expect(
      pickCountLocation({
        here: [],
        nearby: [MAIN, MAIN],
        remembered: 'w-closed-last-year',
        offered: OFFERED,
      })
    ).toBe(MAIN);
  });

  it('ignores a counted place that is no longer on offer', () => {
    expect(
      pickCountLocation({ here: ['w-gone'], nearby: [], remembered: null, offered: OFFERED })
    ).toBe(FC);
  });

  it('falls back to the first place offered when there is no evidence at all', () => {
    expect(pickCountLocation({ here: [], nearby: [], remembered: null, offered: OFFERED })).toBe(
      FC
    );
  });

  it('returns nothing when there is nowhere to count', () => {
    // The form reads '' as "not ready to save", never as a location.
    expect(pickCountLocation({ here: [], nearby: [], remembered: null, offered: [] })).toBe('');
  });
});
