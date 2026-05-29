import { renderModuleOgImage, OG_SIZE } from '@/lib/og-module';
import { MODULES } from '@/lib/modules';
import { loadModuleData } from '@/lib/load-module-data';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = MODULES.cms.title;

export default async function Image() {
  const meta = await loadModuleData('cms');
  return renderModuleOgImage(meta);
}
