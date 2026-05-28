// CRM scheduler barrel. The Cloud Scheduler tick imports each function
// and calls it for every CRM-active tenant. See docs/11 Phase 5 for the
// production wiring.

export {
  runDailyAutomationTriggers,
  type TriggerThresholds,
  type TriggerSummary,
} from './automation-triggers';
export { emitOverdueTaskReminders } from './overdue-task-reminders';
export { ensureCrmActivitiesPartitions, type PartitionRolloverResult } from './partition-rollover';
