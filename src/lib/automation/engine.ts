export type AutomationContext = {
  email: string;
  campaign_id?: string;
  url?: string;
  event_type?: "open" | "click" | "reply" | "bounce" | "reply_linkedin" | "score_v2_change";
  lead_score?: number;
  lead_score_v2?: number;
  workspace_id?: string;
};

export type AutomationRule = {
  id: string;
  workspace_id: string;
  name: string;
  trigger_type: "event" | "score" | "score_v2" | "time";
  event_type?: string;
  condition_json?: any;
  actions: { action_type: string; action_payload: any }[];
  automation_actions?: { action_type: string; action_payload: any }[];
};

export function ruleMatches(rule: AutomationRule, ctx: AutomationContext): boolean {
  // Check if rule belongs to the same workspace
  if (rule.workspace_id && ctx.workspace_id && rule.workspace_id !== ctx.workspace_id) {
    return false;
  }

  if (rule.trigger_type === "event") {
    // Event-based triggers
    if (rule.event_type && rule.event_type !== ctx.event_type) {
      return false;
    }
    
    const conditions = rule.condition_json || {};
    
    // URL contains check
    if (conditions.contains_url && ctx.url && !ctx.url.includes(conditions.contains_url)) {
      return false;
    }
    
    // Email domain check
    if (conditions.email_domain && !ctx.email.endsWith(conditions.email_domain)) {
      return false;
    }
    
    // Campaign ID check
    if (conditions.campaign_id && ctx.campaign_id !== conditions.campaign_id) {
      return false;
    }
  }
  
  if (rule.trigger_type === "score") {
    // Score-based triggers (v1 score)
    const conditions = rule.condition_json || {};
    
    if (typeof conditions.min_score === "number" && (ctx.lead_score ?? 0) < conditions.min_score) {
      return false;
    }
    
    if (typeof conditions.max_score === "number" && (ctx.lead_score ?? 0) > conditions.max_score) {
      return false;
    }
  }

  if (rule.trigger_type === "score_v2" || (rule.trigger_type === "score" && rule.condition_json?.score_v2_min !== undefined)) {
    // Score v2-based triggers
    const conditions = rule.condition_json || {};
    
    // Support both score_v2_min and min_score for v2
    const minScore = conditions.score_v2_min ?? conditions.min_score;
    if (typeof minScore === "number" && (ctx.lead_score_v2 ?? 0) < minScore) {
      return false;
    }
    
    const maxScore = conditions.score_v2_max ?? conditions.max_score;
    if (typeof maxScore === "number" && (ctx.lead_score_v2 ?? 0) > maxScore) {
      return false;
    }
  }
  
  if (rule.trigger_type === "time") {
    // Time-based triggers (for future cron implementation)
    const conditions = rule.condition_json || {};
    
    // Check if it's a specific time of day
    if (conditions.time_of_day) {
      const now = new Date();
      const hour = now.getHours();
      const [startHour, endHour] = conditions.time_of_day.split('-').map(Number);
      
      if (hour < startHour || hour > endHour) {
        return false;
      }
    }
    
    // Check if it's a specific day of week
    if (conditions.day_of_week) {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      if (!conditions.day_of_week.includes(dayOfWeek)) {
        return false;
      }
    }
  }
  
  return true;
}

export function getMatchingRules(rules: AutomationRule[], ctx: AutomationContext): AutomationRule[] {
  return rules.filter(rule => ruleMatches(rule, ctx));
} 