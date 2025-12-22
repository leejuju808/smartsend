/**
 * AUREV HQ Intelligence Engine
 * Core prediction and recommendation logic
 */

import { createServiceClient } from '@/lib/supabase/server';

// Initialize OpenAI client (optional - will fallback if not configured)
let openai: any = null;
if (process.env.OPENAI_API_KEY) {
  try {
    const OpenAI = require('openai').default;
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  } catch (e) {
    console.warn('OpenAI package not available, predictions will use simplified models');
  }
}

interface PredictionInput {
  scope: 'org' | 'global' | 'campaign';
  metric: 'churn' | 'growth' | 'campaign_reply_rate' | 'revenue' | 'engagement';
  horizon: number; // days
  orgId?: string;
  context?: Record<string, any>;
}

interface PredictionResult {
  prediction: number;
  confidence: number;
  drivers: string[];
}

interface RecommendationInput {
  orgId: string;
  context: 'smart_send_campaign' | 'opsgrid_workflow' | 'agentcloud_deployment' | 'general';
  goal: string;
  currentMetrics?: Record<string, number>;
}

interface RecommendationResult {
  recommendations: Array<{
    title: string;
    description: string;
    action: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    estimatedImpact?: Record<string, any>;
    confidence: number;
  }>;
}

/**
 * Fetch historical data for predictions
 */
async function fetchHistoricalData(
  metric: string,
  orgId: string | undefined,
  days: number
): Promise<any[]> {
  const supabase = createServiceClient();
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Fetch data based on metric type
  switch (metric) {
    case 'churn':
      // Get org revenue data
      const { data: revenueData } = await supabase
        .from('org_revenue')
        .select('churn_rate, last_sync')
        .eq('org_id', orgId!)
        .gte('last_sync', startDate.toISOString())
        .order('last_sync', { ascending: true });
      return revenueData || [];
      
    case 'campaign_reply_rate':
      // Get campaign analytics
      const { data: campaignData } = await supabase
        .from('campaign_logs')
        .select('campaign_id, status, replied_at, sent_at')
        .eq('org_id', orgId!)
        .gte('sent_at', startDate.toISOString())
        .order('sent_at', { ascending: true });
      return campaignData || [];
      
    case 'revenue':
    case 'growth':
      // Get revenue data
      const { data: revData } = await supabase
        .from('org_revenue')
        .select('mrr, arr, last_sync')
        .eq('org_id', orgId!)
        .gte('last_sync', startDate.toISOString())
        .order('last_sync', { ascending: true });
      return revData || [];
      
    default:
      return [];
  }
}

/**
 * Calculate prediction using data analysis + LLM
 */
export async function generatePrediction(
  input: PredictionInput
): Promise<PredictionResult> {
  try {
    // Fetch historical data
    const historicalData = await fetchHistoricalData(
      input.metric,
      input.orgId,
      90 // Last 90 days
    );
    
    if (historicalData.length === 0) {
      // Not enough data - return low confidence prediction
      return {
        prediction: 0,
        confidence: 0.1,
        drivers: ['insufficient_data']
      };
    }
    
    // Calculate basic trends
    const values = historicalData.map((d: any) => {
      switch (input.metric) {
        case 'churn':
          return parseFloat(d.churn_rate) || 0;
        case 'campaign_reply_rate':
          // Calculate reply rate from campaign data
          return 0; // Simplified for now
        case 'revenue':
        case 'growth':
          return parseFloat(d.mrr) || 0;
        default:
          return 0;
      }
    });
    
    const trend = values.length > 1 
      ? (values[values.length - 1] - values[0]) / values.length
      : 0;
    
    // Use LLM for sophisticated analysis (if available)
    if (!openai) {
      // Fallback to trend-based prediction
      return {
        prediction: values[values.length - 1] + trend * input.horizon,
        confidence: 0.5,
        drivers: ['trend_analysis', 'historical_patterns']
      };
    }
    
    const prompt = `You are an AI analyst for AUREV HQ, a SaaS operating system.

Given the following historical data for metric "${input.metric}" over the last 90 days, predict the value ${input.horizon} days in the future.

Historical data points (last 90 days):
${JSON.stringify(historicalData.slice(-30), null, 2)}

Context: ${JSON.stringify(input.context || {}, null, 2)}

Provide:
1. Predicted value (numeric)
2. Confidence level (0.0 to 1.0)
3. Top 3 key drivers/factors affecting this prediction

Respond in JSON format:
{
  "prediction": <number>,
  "confidence": <number between 0 and 1>,
  "drivers": ["driver1", "driver2", "driver3"]
}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a data analyst specializing in SaaS metrics and predictions. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });
    
    const response = JSON.parse(completion.choices[0].message.content || '{}');
    
    return {
      prediction: response.prediction || trend,
      confidence: Math.min(Math.max(response.confidence || 0.5, 0), 1),
      drivers: response.drivers || ['trend_analysis', 'historical_patterns']
    };
    
  } catch (error) {
    console.error('Prediction generation error:', error);
    // Fallback to simple trend-based prediction
    return {
      prediction: 0,
      confidence: 0.3,
      drivers: ['error_fallback']
    };
  }
}

/**
 * Generate recommendations using LLM
 */
export async function generateRecommendations(
  input: RecommendationInput
): Promise<RecommendationResult> {
  try {
    // If OpenAI not configured, return basic recommendations
    if (!openai) {
      return {
        recommendations: [
          {
            title: 'Optimize Send Window',
            description: 'Send emails during peak engagement hours (8am-10am EST)',
            action: 'Update send window settings',
            priority: 'medium',
            confidence: 0.6
          }
        ]
      };
    }
    
    const supabase = createServiceClient();
    
    // Fetch current org state
    const { data: org } = await supabase
      .from('orgs')
      .select('id, name')
      .eq('id', input.orgId)
      .single();
    
    // Fetch recent metrics
    const { data: recentRevenue } = await supabase
      .from('org_revenue')
      .select('mrr, arr, churn_rate')
      .eq('org_id', input.orgId)
      .order('last_sync', { ascending: false })
      .limit(1)
      .single();
    
    // Fetch recent campaign performance
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, status')
      .eq('org_id', input.orgId)
      .limit(5);
    
    const contextData = {
      org: org,
      revenue: recentRevenue,
      campaigns: campaigns,
      currentMetrics: input.currentMetrics || {},
      goal: input.goal
    };
    
    const prompt = `You are an AI optimization advisor for AUREV HQ.

Organization Context:
${JSON.stringify(contextData, null, 2)}

Context: ${input.context}
Goal: ${input.goal}

Generate 3-5 actionable recommendations to achieve this goal. Each recommendation should:
1. Have a clear, specific title
2. Include a detailed description
3. Suggest a concrete action
4. Include priority level (low, medium, high, critical)
5. Estimate impact (e.g., "+3% reply rate", "reduce churn by 2%")
6. Include confidence level (0.0 to 1.0)

Respond in JSON format:
{
  "recommendations": [
    {
      "title": "Adjust send window to 8am–10am",
      "description": "Your campaigns are sending outside optimal hours...",
      "action": "Update send window settings to 8am–10am EST",
      "priority": "high",
      "estimatedImpact": {"metric": "reply_rate", "expectedChange": "+3%"},
      "confidence": 0.85
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert SaaS growth advisor. Provide actionable, data-driven recommendations. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5
    });
    
    const response = JSON.parse(completion.choices[0].message.content || '{}');
    
    return {
      recommendations: response.recommendations || []
    };
    
  } catch (error) {
    console.error('Recommendation generation error:', error);
    return {
      recommendations: []
    };
  }
}

/**
 * Detect anomalies in org metrics
 */
export async function detectAnomalies(orgId: string): Promise<Array<{
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metric: string;
  value: number;
  expected: number;
}>> {
  const supabase = createServiceClient();
  
  // Fetch recent metrics
  const { data: revenue } = await supabase
    .from('org_revenue')
    .select('mrr, arr, churn_rate, last_sync')
    .eq('org_id', orgId)
    .order('last_sync', { ascending: false })
    .limit(2)
    .single();
  
  const anomalies: any[] = [];
  
  if (revenue) {
    // Check for churn spike
    const churnRate = parseFloat(revenue.churn_rate) || 0;
    if (churnRate > 5) { // > 5% churn is high
      anomalies.push({
        type: 'high_churn',
        severity: churnRate > 10 ? 'critical' : 'high',
        description: `Churn rate is ${churnRate.toFixed(1)}%, significantly above healthy threshold`,
        metric: 'churn_rate',
        value: churnRate,
        expected: 2
      });
    }
    
    // Check for revenue drop
    // This would compare to historical average
  }
  
  return anomalies;
}

