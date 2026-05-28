// Service-layer barrel. Each service is exposed under a namespace so
// callers write `customerService.list(ctx, ...)`, `dealService.moveStage(...)`,
// etc. — symmetric with how the MCP tool registry will surface them.

export * as customerService from './customer-service.js';
export * as b2bAccountService from './b2b-account-service.js';
export * as pipelineService from './pipeline-service.js';
export * as dealService from './deal-service.js';
export * as activityService from './activity-service.js';
export * as taskService from './task-service.js';
export * as segmentService from './segment-service.js';
