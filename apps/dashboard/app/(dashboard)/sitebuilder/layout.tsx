import { ModuleProvider } from '@sparx/ui';
import { getConfig, getSitePreviewToken, getTenant } from './_lib/api';
import { storefrontOrigin } from './_lib/storefront';
import { EditorShell } from './_components/editor-shell';

// Site Builder editor shell (Phase 2 §2). The contextual-panel module nav
// switches the child route (= the inspector for a scope); this layout — and the
// EditorShell's persistent canvas iframe — stay mounted across those switches,
// so the live preview never reloads when hopping scopes. Scopes that don't want
// a preview (Brand, Publishing) render full-width inside the shell. The data the
// canvas needs (tenant slug, storefront origin, draft preview token) is resolved
// once here rather than per scope page.
export default async function SitebuilderLayout({ children }: { children: React.ReactNode }) {
  const [tenant, config, previewToken] = await Promise.all([
    getTenant(),
    getConfig(),
    getSitePreviewToken(),
  ]);
  const initialMode = config.appearancePolicy === 'dark-only' ? 'dark' : 'light';

  return (
    <ModuleProvider module="storefront">
      <EditorShell
        slug={tenant.slug}
        storefrontUrl={storefrontOrigin(tenant.slug)}
        previewToken={previewToken}
        initialMode={initialMode}
      >
        {children}
      </EditorShell>
    </ModuleProvider>
  );
}
