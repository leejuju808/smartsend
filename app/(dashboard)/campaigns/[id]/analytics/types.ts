// Types for Campaign Analytics v2
// Block 11300 — Campaign Performance Dashboard v2

export type CampaignAnalytics = {
  summary: {
    totalContacts: number;
    delivered: number;
    replies: number;
    uniqueHotLeads: number;
    warmLeads: number;
    estimateRequests: number;
    jobsWon: number;
    estimatedRevenue: number;
    replyRate: number;
    hotRate: number;
    warmRate: number;
  };
  steps: Array<{
    stepId: string | null;
    stepName: string;
    stepNo: number;
    deliveries: number;
    replies: number;
    hotLeads: number;
    warmLeads: number;
    replyRate: number;
    hotRate: number;
    warmRate: number;
    customers: number;
    revenue: number;
  }>;
  contacts: Array<{
    contactId: string;
    name: string;
    email: string;
    status: string;
    latestIntent: string;
    replied: boolean;
    lastActivity: string | null;
    repliesCount: number;
    replyStepName: string | null;
    stepReplied: number | null;
    outcome: string;
    revenue: number | null;
  }>;
  outcomeDistribution: {
    hot: number;
    warm: number;
    notInterested: number;
    noReply: number;
    customer: number;
  };
  comparison?: {
    replyRateChange: number;
    hotLeadRateChange: number;
    estimatedRevenueChange: number;
  };
};

export type LeadJourney = {
  contactId: string;
  name: string;
  email: string;
  stepReplied: number | null;
  intent: string;
  status: string;
  outcome: string;
  revenue: number | null;
  journey: Array<{
    stepNo: number;
    stepName: string;
    status: string;
    sentAt: string | null;
    repliedAt: string | null;
  }>;
};

