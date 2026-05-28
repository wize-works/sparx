// Twitter cards use the same artwork as the OG image; config declared locally
// so Next.js can statically detect it (re-exports of config aren't recognized).
import Image from './opengraph-image';
import { MODULES } from '@/lib/modules';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = MODULES.email.title;

export default Image;
