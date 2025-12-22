/**
 * Block 23610 — SmartSend Roofing Churn Prevention Engine v1
 * Main exports for churn prevention system
 */

// Monitoring
export {
  recordUsage,
  detectChurnSignals,
  getUsageMetrics,
  hasActiveChurnSignals,
  createChurnSignal,
  resolveChurnSignal,
  getDaysSinceSignup
} from './monitoring-service';

// Intervention Scripts
export {
  INTERVENTION_SCRIPTS,
  renderScript,
  getCampaignTypeDisplayName
} from './intervention-scripts';

// Intervention Service
export {
  sendIntervention,
  sendEasyWinIntervention,
  sendLowReplyIntervention,
  sendDashboardGhostIntervention,
  sendBusyExcuseIntervention
} from './intervention-service';

// Campaign Ladder
export {
  getNextCampaignType,
  launchCampaignLadderCampaign,
  launchNextCampaignIfDue
} from './campaign-ladder';

// Monthly Check-In
export {
  getMonthlyMetrics,
  sendMonthlyCheckIn,
  getWorkspacesNeedingCheckIn
} from './monthly-checkin';

// Win-Back
export {
  recordCancellation,
  sendWinBackAttempt,
  markWinBackSuccess,
  getCancelledWorkspacesNeedingWinBack
} from './winback-service';

// 90-Day Retention Play
export {
  needs90DayRetentionPlay,
  execute90DayRetentionPlay,
  getWorkspacesNeeding90DayRetention
} from './retention-play';

// Integration Helpers
export {
  trackCampaignLaunch,
  trackCampaignSent,
  trackReplyReceived,
  trackEmailOpen,
  trackEmailClick
} from './integration-helpers';

// React Hook
export { useDashboardTracker } from './use-dashboard-tracker';






































