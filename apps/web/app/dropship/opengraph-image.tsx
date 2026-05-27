import { renderModuleOgImage, OG_SIZE } from '@/lib/og-module';
import { MODULES } from '@/lib/modules';

export const runtime = 'edge';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = MODULES.dropship.title;

export default function Image() {
  return renderModuleOgImage(MODULES.dropship);
}
