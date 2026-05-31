// Service-layer barrel. Each service is exposed under a namespace so callers
// write `themeService.selectTheme(ctx, ...)`, `publishService.publishNow(...)`,
// etc. — symmetric with the MCP tool registry.

export * as themeService from './theme-service';
export * as sectionService from './section-service';
export * as templateService from './template-service';
export * as layoutService from './layout-service';
export * as publishService from './publish-service';
export * as scheduleService from './schedule-service';

// Shared snapshot types consumed by the public storefront endpoint.
export type { PublishedSnapshot, SectionSnapshot, LayoutSnapshot } from './publish-internals';
