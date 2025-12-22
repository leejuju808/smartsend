// Block 23080 — SmartSend Roofing Starter Plan v1
// Comprehensive feature matrix for all plan tiers

type PlanKey = "free" | "starter" | "growth" | "domination";

export interface PlanFeatures {
  // Core limits
  maxCampaigns: number;
  maxEmailsPerMonth: number;
  
  // Cold Email Engine
  coldEmailBasicAi: boolean;
  coldEmailAdvancedAi: boolean;
  coldEmailReplyDetection: boolean;
  coldEmailLeadLabeling: boolean;
  coldEmailBasicFollowup: boolean;
  coldEmailMultiStepFollowup: boolean;
  
  // Scheduling
  schedulingAddJobs: boolean;
  schedulingBasicCalendar: boolean;
  schedulingCrewAssignmentManual: boolean;
  schedulingAiScheduling: boolean;
  schedulingMaterialDriven: boolean;
  schedulingOverlapDetection: boolean;
  schedulingMultiCrew: boolean;
  
  // Documents
  documentsUploadContracts: boolean;
  documentsSendToHomeowner: boolean;
  documentsBasicEsign: boolean;
  documentsMultiVersion: boolean;
  documentsChangeOrderAutomation: boolean;
  documentsTemplates: boolean;
  
  // Payments
  paymentsDepositRequests: boolean;
  paymentsStripeLinks: boolean;
  paymentsMarkManually: boolean;
  paymentsAch: boolean;
  paymentsJobBalanceIntelligence: boolean;
  paymentsAutomation: boolean;
  paymentsInvoiceAgingKpis: boolean;
  
  // AI Intelligence
  aiIntelligenceDailySummary: boolean;
  aiIntelligenceInsightsPerJob: number;
  aiIntelligenceRiskDetection: boolean;
  aiIntelligenceMarginAnalysis: boolean;
  aiIntelligenceSchedulePredictions: boolean;
  aiIntelligenceSupplierIntelligence: boolean;
  aiIntelligenceDailyBriefings: boolean;
  
  // Automations
  automationsMaxRules: number;
  automationsMultiStepWorkflows: boolean;
  automationsProductionAlerts: boolean;
  automationsMaterialDelayAlerts: boolean;
  automationsReviewRequests: boolean;
  automationsCustomConditions: boolean;
  
  // Field App
  fieldAppPhotoUploads: boolean;
  fieldAppNotes: boolean;
  fieldAppCrewCheckin: boolean;
  fieldAppProductivityScoring: boolean;
  fieldAppForecastUpdates: boolean;
  
  // Homeowner Portal
  homeownerPortalDocuments: boolean;
  homeownerPortalPayments: boolean;
  homeownerPortalProgressPhotos: boolean;
  homeownerPortalMessaging: boolean;
  homeownerPortalReviewRequest: boolean;
  homeownerPortalAiSummaries: boolean;
  
  // Dashboard
  dashboardLeads: boolean;
  dashboardReplies: boolean;
  dashboardEstimatesSent: boolean;
  dashboardBasicPipeline: boolean;
  dashboardProfitDashboard: boolean;
  dashboardMarginTracking: boolean;
  dashboardCrewKpis: boolean;
  dashboardSupplierReliability: boolean;
  dashboardForecastTrends: boolean;
  
  // Additional Features
  materialTracking: boolean;
  crewProductivityScores: boolean;
  profitForecasting: boolean;
  
  // Legacy fields (for backward compatibility)
  autoFollowups: boolean;
  advancedIntent: boolean;
  revenueDashboard: boolean;
}

const FEATURE_MATRIX: Record<PlanKey, PlanFeatures> = {
  free: {
    maxCampaigns: 1,
    maxEmailsPerMonth: 0,
    coldEmailBasicAi: false,
    coldEmailAdvancedAi: false,
    coldEmailReplyDetection: false,
    coldEmailLeadLabeling: false,
    coldEmailBasicFollowup: false,
    coldEmailMultiStepFollowup: false,
    schedulingAddJobs: false,
    schedulingBasicCalendar: false,
    schedulingCrewAssignmentManual: false,
    schedulingAiScheduling: false,
    schedulingMaterialDriven: false,
    schedulingOverlapDetection: false,
    schedulingMultiCrew: false,
    documentsUploadContracts: false,
    documentsSendToHomeowner: false,
    documentsBasicEsign: false,
    documentsMultiVersion: false,
    documentsChangeOrderAutomation: false,
    documentsTemplates: false,
    paymentsDepositRequests: false,
    paymentsStripeLinks: false,
    paymentsMarkManually: false,
    paymentsAch: false,
    paymentsJobBalanceIntelligence: false,
    paymentsAutomation: false,
    paymentsInvoiceAgingKpis: false,
    aiIntelligenceDailySummary: false,
    aiIntelligenceInsightsPerJob: 0,
    aiIntelligenceRiskDetection: false,
    aiIntelligenceMarginAnalysis: false,
    aiIntelligenceSchedulePredictions: false,
    aiIntelligenceSupplierIntelligence: false,
    aiIntelligenceDailyBriefings: false,
    automationsMaxRules: 0,
    automationsMultiStepWorkflows: false,
    automationsProductionAlerts: false,
    automationsMaterialDelayAlerts: false,
    automationsReviewRequests: false,
    automationsCustomConditions: false,
    fieldAppPhotoUploads: false,
    fieldAppNotes: false,
    fieldAppCrewCheckin: false,
    fieldAppProductivityScoring: false,
    fieldAppForecastUpdates: false,
    homeownerPortalDocuments: false,
    homeownerPortalPayments: false,
    homeownerPortalProgressPhotos: false,
    homeownerPortalMessaging: false,
    homeownerPortalReviewRequest: false,
    homeownerPortalAiSummaries: false,
    dashboardLeads: false,
    dashboardReplies: false,
    dashboardEstimatesSent: false,
    dashboardBasicPipeline: false,
    dashboardProfitDashboard: false,
    dashboardMarginTracking: false,
    dashboardCrewKpis: false,
    dashboardSupplierReliability: false,
    dashboardForecastTrends: false,
    materialTracking: false,
    crewProductivityScores: false,
    profitForecasting: false,
    autoFollowups: false,
    advancedIntent: false,
    revenueDashboard: false,
  },
  starter: {
    // Block 23080 — Starter Plan: "1 Campaign • 500 Emails • Basic AI • Limited Automations — $99/mo."
    maxCampaigns: 1,
    maxEmailsPerMonth: 500,
    // Cold Email Engine (Basic) ✅ INCLUDED
    coldEmailBasicAi: true,
    coldEmailAdvancedAi: false, // ❌ UPSELL
    coldEmailReplyDetection: true,
    coldEmailLeadLabeling: true,
    coldEmailBasicFollowup: true,
    coldEmailMultiStepFollowup: false, // ❌ UPSELL
    // Scheduling (Lite) ✅ INCLUDED
    schedulingAddJobs: true,
    schedulingBasicCalendar: true,
    schedulingCrewAssignmentManual: true,
    schedulingAiScheduling: false, // ❌ UPSELL
    schedulingMaterialDriven: false, // ❌ UPSELL
    schedulingOverlapDetection: false, // ❌ UPSELL
    schedulingMultiCrew: false, // ❌ UPSELL
    // Documents (Lite) ✅ INCLUDED
    documentsUploadContracts: true,
    documentsSendToHomeowner: true,
    documentsBasicEsign: true,
    documentsMultiVersion: false, // ❌ UPSELL
    documentsChangeOrderAutomation: false, // ❌ UPSELL
    documentsTemplates: false, // ❌ UPSELL
    // Payments (Lite) ✅ INCLUDED
    paymentsDepositRequests: true,
    paymentsStripeLinks: true,
    paymentsMarkManually: true,
    paymentsAch: false, // ❌ UPSELL
    paymentsJobBalanceIntelligence: false, // ❌ UPSELL
    paymentsAutomation: false, // ❌ UPSELL
    paymentsInvoiceAgingKpis: false, // ❌ UPSELL
    // AI Intelligence (Lite) ✅ INCLUDED
    aiIntelligenceDailySummary: true,
    aiIntelligenceInsightsPerJob: 2, // 1-2 insights per job
    aiIntelligenceRiskDetection: false, // ❌ UPSELL
    aiIntelligenceMarginAnalysis: false, // ❌ UPSELL
    aiIntelligenceSchedulePredictions: false, // ❌ UPSELL
    aiIntelligenceSupplierIntelligence: false, // ❌ UPSELL
    aiIntelligenceDailyBriefings: false, // ❌ UPSELL
    // Automations (Lite) ✅ INCLUDED
    automationsMaxRules: 1, // 1 automation rule
    automationsMultiStepWorkflows: false, // ❌ UPSELL
    automationsProductionAlerts: false, // ❌ UPSELL
    automationsMaterialDelayAlerts: false, // ❌ UPSELL
    automationsReviewRequests: false, // ❌ UPSELL
    automationsCustomConditions: false, // ❌ UPSELL
    // Field App (Lite) ✅ INCLUDED
    fieldAppPhotoUploads: true,
    fieldAppNotes: true,
    fieldAppCrewCheckin: true,
    fieldAppProductivityScoring: false, // ❌ UPSELL
    fieldAppForecastUpdates: false, // ❌ UPSELL
    // Homeowner Portal (Lite) ✅ INCLUDED
    homeownerPortalDocuments: true,
    homeownerPortalPayments: true,
    homeownerPortalProgressPhotos: true,
    homeownerPortalMessaging: false, // ❌ UPSELL
    homeownerPortalReviewRequest: false, // ❌ UPSELL
    homeownerPortalAiSummaries: false, // ❌ UPSELL
    // Dashboard (Lite) ✅ INCLUDED
    dashboardLeads: true,
    dashboardReplies: true,
    dashboardEstimatesSent: true,
    dashboardBasicPipeline: true,
    dashboardProfitDashboard: false, // ❌ UPSELL
    dashboardMarginTracking: false, // ❌ UPSELL
    dashboardCrewKpis: false, // ❌ UPSELL
    dashboardSupplierReliability: false, // ❌ UPSELL
    dashboardForecastTrends: false, // ❌ UPSELL
    // Additional Features ❌ UPSELL
    materialTracking: false,
    crewProductivityScores: false,
    profitForecasting: false,
    // Legacy fields
    autoFollowups: false,
    advancedIntent: false,
    revenueDashboard: false,
  },
  growth: {
    maxCampaigns: 3,
    maxEmailsPerMonth: 2000,
    coldEmailBasicAi: true,
    coldEmailAdvancedAi: true,
    coldEmailReplyDetection: true,
    coldEmailLeadLabeling: true,
    coldEmailBasicFollowup: true,
    coldEmailMultiStepFollowup: true,
    schedulingAddJobs: true,
    schedulingBasicCalendar: true,
    schedulingCrewAssignmentManual: true,
    schedulingAiScheduling: true,
    schedulingMaterialDriven: true,
    schedulingOverlapDetection: true,
    schedulingMultiCrew: false, // Still limited in Growth
    documentsUploadContracts: true,
    documentsSendToHomeowner: true,
    documentsBasicEsign: true,
    documentsMultiVersion: true,
    documentsChangeOrderAutomation: true,
    documentsTemplates: true,
    paymentsDepositRequests: true,
    paymentsStripeLinks: true,
    paymentsMarkManually: true,
    paymentsAch: true,
    paymentsJobBalanceIntelligence: true,
    paymentsAutomation: true,
    paymentsInvoiceAgingKpis: false, // Still limited
    aiIntelligenceDailySummary: true,
    aiIntelligenceInsightsPerJob: 5,
    aiIntelligenceRiskDetection: true,
    aiIntelligenceMarginAnalysis: true,
    aiIntelligenceSchedulePredictions: true,
    aiIntelligenceSupplierIntelligence: false, // Still limited
    aiIntelligenceDailyBriefings: true,
    automationsMaxRules: 10,
    automationsMultiStepWorkflows: true,
    automationsProductionAlerts: true,
    automationsMaterialDelayAlerts: true,
    automationsReviewRequests: true,
    automationsCustomConditions: true,
    fieldAppPhotoUploads: true,
    fieldAppNotes: true,
    fieldAppCrewCheckin: true,
    fieldAppProductivityScoring: true,
    fieldAppForecastUpdates: true,
    homeownerPortalDocuments: true,
    homeownerPortalPayments: true,
    homeownerPortalProgressPhotos: true,
    homeownerPortalMessaging: true,
    homeownerPortalReviewRequest: true,
    homeownerPortalAiSummaries: false, // Still limited
    dashboardLeads: true,
    dashboardReplies: true,
    dashboardEstimatesSent: true,
    dashboardBasicPipeline: true,
    dashboardProfitDashboard: false, // Still limited
    dashboardMarginTracking: false, // Still limited
    dashboardCrewKpis: false, // Still limited
    dashboardSupplierReliability: false, // Still limited
    dashboardForecastTrends: false, // Still limited
    materialTracking: true,
    crewProductivityScores: false, // Still limited
    profitForecasting: false, // Still limited
    autoFollowups: true,
    advancedIntent: true,
    revenueDashboard: false,
  },
  domination: {
    maxCampaigns: 999999, // Unlimited
    maxEmailsPerMonth: 999999, // Unlimited
    coldEmailBasicAi: true,
    coldEmailAdvancedAi: true,
    coldEmailReplyDetection: true,
    coldEmailLeadLabeling: true,
    coldEmailBasicFollowup: true,
    coldEmailMultiStepFollowup: true,
    schedulingAddJobs: true,
    schedulingBasicCalendar: true,
    schedulingCrewAssignmentManual: true,
    schedulingAiScheduling: true,
    schedulingMaterialDriven: true,
    schedulingOverlapDetection: true,
    schedulingMultiCrew: true,
    documentsUploadContracts: true,
    documentsSendToHomeowner: true,
    documentsBasicEsign: true,
    documentsMultiVersion: true,
    documentsChangeOrderAutomation: true,
    documentsTemplates: true,
    paymentsDepositRequests: true,
    paymentsStripeLinks: true,
    paymentsMarkManually: true,
    paymentsAch: true,
    paymentsJobBalanceIntelligence: true,
    paymentsAutomation: true,
    paymentsInvoiceAgingKpis: true,
    aiIntelligenceDailySummary: true,
    aiIntelligenceInsightsPerJob: 999999, // Unlimited
    aiIntelligenceRiskDetection: true,
    aiIntelligenceMarginAnalysis: true,
    aiIntelligenceSchedulePredictions: true,
    aiIntelligenceSupplierIntelligence: true,
    aiIntelligenceDailyBriefings: true,
    automationsMaxRules: 999999, // Unlimited
    automationsMultiStepWorkflows: true,
    automationsProductionAlerts: true,
    automationsMaterialDelayAlerts: true,
    automationsReviewRequests: true,
    automationsCustomConditions: true,
    fieldAppPhotoUploads: true,
    fieldAppNotes: true,
    fieldAppCrewCheckin: true,
    fieldAppProductivityScoring: true,
    fieldAppForecastUpdates: true,
    homeownerPortalDocuments: true,
    homeownerPortalPayments: true,
    homeownerPortalProgressPhotos: true,
    homeownerPortalMessaging: true,
    homeownerPortalReviewRequest: true,
    homeownerPortalAiSummaries: true,
    dashboardLeads: true,
    dashboardReplies: true,
    dashboardEstimatesSent: true,
    dashboardBasicPipeline: true,
    dashboardProfitDashboard: true,
    dashboardMarginTracking: true,
    dashboardCrewKpis: true,
    dashboardSupplierReliability: true,
    dashboardForecastTrends: true,
    materialTracking: true,
    crewProductivityScores: true,
    profitForecasting: true,
    autoFollowups: true,
    advancedIntent: true,
    revenueDashboard: true,
  },
};

export function getFeatures(planKey: PlanKey): PlanFeatures {
  return FEATURE_MATRIX[planKey] ?? FEATURE_MATRIX.free;
}

export function hasFeature(planKey: PlanKey, feature: keyof PlanFeatures): boolean {
  const features = getFeatures(planKey);
  const value = features[feature];
  return typeof value === 'boolean' ? value : value > 0;
}





















