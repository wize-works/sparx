// Twitter cards use the same artwork as the OG image.
// We re-use the rendering function but declare config locally so Next.js can
// statically detect it (re-exports of config fields aren't recognized).
import Image from './opengraph-image';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Sparx — Commerce, ignited.';

export default Image;
