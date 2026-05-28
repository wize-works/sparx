import { makeMetadata, makePage } from '@/lib/load-module';

// Marketing /cms — reads from the Sparx CMS via api-rest's public
// surface. See apps/web/lib/load-module.ts for the loader. Falls back
// to the hand-coded MODULES.cms in lib/modules.ts if the CMS call
// fails so a backend outage can't black-hole sparx.works.

export const generateMetadata = makeMetadata('cms');
export default makePage('cms');
