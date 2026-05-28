// Service-layer barrel. Each service is exposed under a namespace so
// callers write `customerService.list(ctx, ...)`, `dealService.moveStage(...)`,
// etc. — symmetric with how the MCP tool registry will surface them.

export * as customerService from './customer-service';
export * as b2bAccountService from './b2b-account-service';
export * as pipelineService from './pipeline-service';
export * as dealService from './deal-service';
export * as activityService from './activity-service';
export * as taskService from './task-service';
export * as segmentService from './segment-service';
