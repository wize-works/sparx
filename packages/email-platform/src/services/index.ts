// Email-platform service layer — the single source of truth shared by REST,
// MCP, and Server Actions. One service module per surface, each re-exported as
// a namespace so callers write `settingsService.get(ctx)` etc.
//
// Surfaces land per delivery phase (docs/13 build plan):
//   P2 — settingsService, domainService          (done)
//   P3 — suppressionService, webhookService       (done)
//   P4 — templateService                          (done)
//   P5 — automationService, dispatchService
//   P6 — broadcastService
//   P7 — analyticsService

export * as settingsService from './settings-service';
export * as domainService from './domain-service';
export * as suppressionService from './suppression-service';
export * as webhookService from './webhook-service';
export * as brandService from './brand-service';
export * as templateService from './template-service';
export * as automationService from './automation-service';

export { BUILTIN_TEMPLATES, getBuiltinTemplate, type BuiltinTemplate } from '../builtin-templates';
export {
  DEFAULT_AUTOMATIONS,
  getDefaultAutomation,
  type DefaultAutomation,
} from '../default-automations';
