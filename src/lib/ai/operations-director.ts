// Block 254100 — SmartSend Operations AI Director v1
// AI Predicts Delays, Optimizes Crew Assignments, Prevents Mistakes, Auto-Schedules Materials, Auto-Fixes Bottlenecks

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface DelayPrediction {
  predicted_delay_hours: number;
  confidence: number;
  reasons: string[];
  recommendation: string;
}

export interface CrewRecommendation {
  recommended_crew_id: string;
  recommended_crew_name: string;
  score: number;
  reasoning: string;
  backup_crew_id?: string;
  backup_crew_name?: string;
  avoid_crew_ids?: string[];
}

export interface MaterialForecast {
  material_name: string;
  quantity: number;
  unit: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
  estimated_shortage?: number;
}

export interface BottleneckResolution {
  bottleneck_type: string;
  affected_job_id: string;
  recommended_action: string;
  predicted_time_saved: number;
  details: Record<string, any>;
}

export interface ScheduleOptimization {
  recommended_start_time: string;
  recommended_crew_id: string;
  material_delivery_time: string;
  predicted_completion: string;
  weather_risk: 'low' | 'medium' | 'high';
  confidence: number;
}

export interface PreventativeAlert {
  alert_type: 'weather_warning' | 'crew_performance' | 'material_delivery' | 'safety_risk' | 'schedule_conflict' | 'quality_issue' | 'bottleneck_forming' | 'supplier_delay';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  alert_data: Record<string, any>;
}

export class OperationsAIDirector {
  /**
   * Predict job delays based on multiple factors
   */
  static async predictDelay(input: {
    jobId: string;
    crewId?: string;
    crewEfficiencyScore?: number;
    crewInstallSpeed?: number;
    scheduledStartDate: string;
    jobType?: string;
    estimatedSquares?: number;
    weatherForecast?: string;
    materialDeliveryStatus?: 'on_time' | 'delayed' | 'pending';
    photoProgress?: {
      underlaymentDetected: boolean;
      installDetected: boolean;
      latestStage?: string;
    };
    hoursWorkedSoFar?: number;
    expectedHours?: number;
  }): Promise<DelayPrediction> {
    const systemPrompt = `You are SmartSend Operations AI Director - an expert at predicting roofing job delays.

Analyze all factors and predict delays with high accuracy. Consider:
- Crew install speed vs their normal performance
- Weather forecast impact
- Material delivery status
- Photo progress detection (underlayment, install stages)
- Job complexity and type
- Hours worked vs expected

Return JSON with:
- predicted_delay_hours (numeric)
- confidence (0-1)
- reasons (array of strings)
- recommendation (actionable string)`;

    const userPrompt = `Predict delay for job:

JOB ID: ${input.jobId}
CREW ID: ${input.crewId || 'Not assigned'}
CREW EFFICIENCY SCORE: ${input.crewEfficiencyScore || 'Unknown'}
CREW INSTALL SPEED: ${input.crewInstallSpeed || 'Unknown'}% of normal
SCHEDULED START: ${input.scheduledStartDate}
JOB TYPE: ${input.jobType || 'Unknown'}
ESTIMATED SQUARES: ${input.estimatedSquares || 'Unknown'}
WEATHER FORECAST: ${input.weatherForecast || 'Not provided'}
MATERIAL DELIVERY: ${input.materialDeliveryStatus || 'Unknown'}
PHOTO PROGRESS: ${JSON.stringify(input.photoProgress || {})}
HOURS WORKED: ${input.hoursWorkedSoFar || 0}
EXPECTED HOURS: ${input.expectedHours || 'Unknown'}

Return JSON prediction.`;

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) throw new Error('No response from AI');

      const parsed = JSON.parse(response);
      
      return {
        predicted_delay_hours: Math.max(0, parsed.predicted_delay_hours || 0),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasons: parsed.reasons || [],
        recommendation: parsed.recommendation || 'Monitor job progress'
      };
    } catch (error) {
      console.error('OperationsAIDirector predictDelay error:', error);
      return {
        predicted_delay_hours: 0,
        confidence: 0.3,
        reasons: ['Unable to predict delay - insufficient data'],
        recommendation: 'Monitor job progress manually'
      };
    }
  }

  /**
   * Recommend optimal crew for a job
   */
  static async recommendCrew(input: {
    jobId: string;
    jobType: string;
    estimatedSquares?: number;
    roofType?: string;
    roofPitch?: number;
    scheduledStartDate: string;
    availableCrews: Array<{
      id: string;
      name: string;
      efficiencyScore: number;
      installSpeedScore: number;
      qcQualityScore: number;
      safetyScore: number;
      materialWasteScore: number;
      onTimeRateScore: number;
      jobsCompleted: number;
      skillSets?: string[];
    }>;
  }): Promise<CrewRecommendation | null> {
    const systemPrompt = `You are SmartSend Operations AI Director - an expert at crew assignment optimization.

Analyze job requirements and crew capabilities to recommend the best crew match.

Consider:
- Job type (2-layer tear-off, steep slope, repairs)
- Crew efficiency scores
- Crew skill sets
- Crew safety history
- Material waste rates
- On-time completion rates
- Job location and routing

Return JSON with:
- recommended_crew_id
- recommended_crew_name
- score (0-100)
- reasoning
- backup_crew_id (optional)
- backup_crew_name (optional)
- avoid_crew_ids (array of crew IDs to avoid)`;

    const userPrompt = `Recommend crew for job:

JOB ID: ${input.jobId}
JOB TYPE: ${input.jobType}
ESTIMATED SQUARES: ${input.estimatedSquares || 'Unknown'}
ROOF TYPE: ${input.roofType || 'Unknown'}
ROOF PITCH: ${input.roofPitch || 'Unknown'}
SCHEDULED START: ${input.scheduledStartDate}

AVAILABLE CREWS:
${JSON.stringify(input.availableCrews, null, 2)}

Return JSON recommendation.`;

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) throw new Error('No response from AI');

      const parsed = JSON.parse(response);
      
      if (!parsed.recommended_crew_id) return null;

      return {
        recommended_crew_id: parsed.recommended_crew_id,
        recommended_crew_name: parsed.recommended_crew_name || 'Unknown',
        score: Math.max(0, Math.min(100, parsed.score || 50)),
        reasoning: parsed.reasoning || 'Best match for job requirements',
        backup_crew_id: parsed.backup_crew_id,
        backup_crew_name: parsed.backup_crew_name,
        avoid_crew_ids: parsed.avoid_crew_ids || []
      };
    } catch (error) {
      console.error('OperationsAIDirector recommendCrew error:', error);
      return null;
    }
  }

  /**
   * Forecast material needs and detect shortages
   */
  static async forecastMaterialNeeds(input: {
    jobId: string;
    jobType: string;
    estimatedSquares: number;
    roofPitch?: number;
    layers?: number;
    shingleType?: string;
    currentMaterials?: Array<{
      name: string;
      quantity: number;
      unit: string;
    }>;
    forecastedMaterials?: Array<{
      name: string;
      quantity: number;
      unit: string;
    }>;
    weatherForecast?: string;
  }): Promise<MaterialForecast[]> {
    const systemPrompt = `You are SmartSend Operations AI Director - an expert at material forecasting.

Analyze job requirements and predict material shortages BEFORE they cause delays.

Consider:
- PO vs actual usage patterns
- Delays in supplier delivery
- Missing items detected by AI camera
- Weather (may require more underlayment)
- Roof type and complexity
- Job phase

Return JSON array of material forecasts with:
- material_name
- quantity (additional needed)
- unit
- urgency (low, medium, high, critical)
- reasoning
- estimated_shortage (optional)`;

    const userPrompt = `Forecast material needs for job:

JOB ID: ${input.jobId}
JOB TYPE: ${input.jobType}
ESTIMATED SQUARES: ${input.estimatedSquares}
ROOF PITCH: ${input.roofPitch || 'Unknown'}
LAYERS: ${input.layers || 1}
SHINGLE TYPE: ${input.shingleType || 'Unknown'}
WEATHER FORECAST: ${input.weatherForecast || 'Not provided'}

CURRENT MATERIALS:
${JSON.stringify(input.currentMaterials || [], null, 2)}

FORECASTED MATERIALS:
${JSON.stringify(input.forecastedMaterials || [], null, 2)}

Return JSON array of material forecasts.`;

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) throw new Error('No response from AI');

      const parsed = JSON.parse(response);
      const forecasts = parsed.forecasts || parsed.materials || [];
      
      return forecasts.map((f: any) => ({
        material_name: f.material_name || f.name,
        quantity: f.quantity || 0,
        unit: f.unit || 'bundles',
        urgency: f.urgency || 'medium',
        reasoning: f.reasoning || 'Material needed for job completion',
        estimated_shortage: f.estimated_shortage
      }));
    } catch (error) {
      console.error('OperationsAIDirector forecastMaterialNeeds error:', error);
      return [];
    }
  }

  /**
   * Identify and resolve bottlenecks
   */
  static async resolveBottleneck(input: {
    jobId: string;
    bottleneckType?: string;
    slowTasks?: Array<{ task: string; duration: number; expected: number }>;
    missingCrewMembers?: number;
    safetyPauses?: number;
    materialDelay?: boolean;
    weatherInterruptions?: number;
    subLateness?: boolean;
    availableCrews?: Array<{ id: string; name: string; availableHours: number }>;
  }): Promise<BottleneckResolution | null> {
    const systemPrompt = `You are SmartSend Operations AI Director - an expert at bottleneck resolution.

Analyze bottlenecks and suggest solutions BEFORE they cost money.

Consider:
- Slow tasks
- Missing crew members
- Safety pauses
- Material delays
- Weather interruptions
- Sub lateness

Return JSON with:
- bottleneck_type
- affected_job_id
- recommended_action
- predicted_time_saved (hours)
- details (object with specific recommendations)`;

    const userPrompt = `Resolve bottleneck for job:

JOB ID: ${input.jobId}
BOTTLENECK TYPE: ${input.bottleneckType || 'Unknown'}
SLOW TASKS: ${JSON.stringify(input.slowTasks || [], null, 2)}
MISSING CREW MEMBERS: ${input.missingCrewMembers || 0}
SAFETY PAUSES: ${input.safetyPauses || 0}
MATERIAL DELAY: ${input.materialDelay ? 'Yes' : 'No'}
WEATHER INTERRUPTIONS: ${input.weatherInterruptions || 0}
SUB LATENESS: ${input.subLateness ? 'Yes' : 'No'}

AVAILABLE CREWS:
${JSON.stringify(input.availableCrews || [], null, 2)}

Return JSON resolution.`;

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) throw new Error('No response from AI');

      const parsed = JSON.parse(response);
      
      return {
        bottleneck_type: parsed.bottleneck_type || 'unknown',
        affected_job_id: input.jobId,
        recommended_action: parsed.recommended_action || 'Monitor and adjust',
        predicted_time_saved: parsed.predicted_time_saved || 0,
        details: parsed.details || {}
      };
    } catch (error) {
      console.error('OperationsAIDirector resolveBottleneck error:', error);
      return null;
    }
  }

  /**
   * Optimize job schedule
   */
  static async optimizeSchedule(input: {
    jobId: string;
    preferredStartDate: string;
    jobType: string;
    estimatedSquares: number;
    availableCrews: Array<{
      id: string;
      name: string;
      efficiencyScore: number;
      availableDate: string;
    }>;
    weatherForecast?: Array<{
      date: string;
      conditions: string;
      risk: 'low' | 'medium' | 'high';
    }>;
    materialDeliveryDate?: string;
  }): Promise<ScheduleOptimization | null> {
    const systemPrompt = `You are SmartSend Operations AI Director - an expert at schedule optimization.

Optimize job scheduling by predicting:
- Best start time
- Best crew
- Best material delivery time
- Best weather window
- Total predicted hours

Return JSON with:
- recommended_start_time (e.g., "8:30 AM")
- recommended_crew_id
- material_delivery_time (e.g., "7:45 AM")
- predicted_completion (e.g., "3:50 PM")
- weather_risk (low, medium, high)
- confidence (0-1)`;

    const userPrompt = `Optimize schedule for job:

JOB ID: ${input.jobId}
PREFERRED START: ${input.preferredStartDate}
JOB TYPE: ${input.jobType}
ESTIMATED SQUARES: ${input.estimatedSquares}

AVAILABLE CREWS:
${JSON.stringify(input.availableCrews, null, 2)}

WEATHER FORECAST:
${JSON.stringify(input.weatherForecast || [], null, 2)}

MATERIAL DELIVERY DATE: ${input.materialDeliveryDate || 'Not scheduled'}

Return JSON optimization.`;

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) throw new Error('No response from AI');

      const parsed = JSON.parse(response);
      
      return {
        recommended_start_time: parsed.recommended_start_time || '8:00 AM',
        recommended_crew_id: parsed.recommended_crew_id || '',
        material_delivery_time: parsed.material_delivery_time || '7:00 AM',
        predicted_completion: parsed.predicted_completion || '5:00 PM',
        weather_risk: parsed.weather_risk || 'medium',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.7))
      };
    } catch (error) {
      console.error('OperationsAIDirector optimizeSchedule error:', error);
      return null;
    }
  }

  /**
   * Generate preventative alerts
   */
  static async generatePreventativeAlerts(input: {
    workspaceId: string;
    jobs: Array<{
      id: string;
      scheduledStartDate: string;
      crewId?: string;
      crewName?: string;
    }>;
    weatherWarnings?: Array<{
      date: string;
      type: string;
      severity: string;
    }>;
    crewPerformance?: Array<{
      crewId: string;
      crewName: string;
      safetyScore: number;
      efficiencyScore: number;
    }>;
    materialDeliveries?: Array<{
      jobId: string;
      deliveryDate: string;
      status: string;
      delayMinutes?: number;
    }>;
  }): Promise<PreventativeAlert[]> {
    const alerts: PreventativeAlert[] = [];

    // Weather warnings
    if (input.weatherWarnings) {
      for (const warning of input.weatherWarnings) {
        alerts.push({
          alert_type: 'weather_warning',
          severity: warning.severity === 'critical' ? 'critical' : 'warning',
          title: `Weather Warning: ${warning.type}`,
          message: `Tornado Watch — postpone job start by 1 hour`,
          alert_data: {
            weather_type: warning.type,
            date: warning.date,
            recommended_action: 'postpone job start by 1 hour'
          }
        });
      }
    }

    // Crew performance alerts
    if (input.crewPerformance) {
      for (const crew of input.crewPerformance) {
        if (crew.safetyScore < 70) {
          alerts.push({
            alert_type: 'crew_performance',
            severity: 'warning',
            title: `Crew Performance Alert: ${crew.crewName}`,
            message: `Crew has low safety score today (${crew.safetyScore}). Monitor closely.`,
            alert_data: {
              crew_id: crew.crewId,
              crew_name: crew.crewName,
              safety_score: crew.safetyScore,
              efficiency_score: crew.efficiencyScore
            }
          });
        }
      }
    }

    // Material delivery alerts
    if (input.materialDeliveries) {
      for (const delivery of input.materialDeliveries) {
        if (delivery.status === 'delayed' && delivery.delayMinutes) {
          alerts.push({
            alert_type: 'material_delivery',
            severity: delivery.delayMinutes > 60 ? 'critical' : 'warning',
            title: `Material Delivery Delay`,
            message: `Supplier delivery late by ${delivery.delayMinutes} minutes. Adjust schedule.`,
            alert_data: {
              job_id: delivery.jobId,
              delivery_date: delivery.deliveryDate,
              delay_minutes: delivery.delayMinutes
            }
          });
        }
      }
    }

    return alerts;
  }

  /**
   * Voice Assistant - Operations Copilot
   */
  static async answerVoiceQuery(input: {
    query: string;
    context: {
      workspaceId: string;
      jobs?: Array<{
        id: string;
        title: string;
        status: string;
        scheduledStartDate?: string;
      }>;
      crews?: Array<{
        id: string;
        name: string;
        efficiencyScore: number;
      }>;
      predictions?: Array<{
        jobId: string;
        type: string;
        message: string;
      }>;
    };
  }): Promise<string> {
    const systemPrompt = `You are SmartSend Operations Copilot - a voice assistant for Project Managers.

Answer questions about:
- Job delays
- Crew assignments
- Material needs
- Risks and alerts
- Crew performance
- Tomorrow's schedule
- Morning briefings

Be concise, actionable, and helpful.`;

    const userPrompt = `Answer this question: "${input.query}"

CONTEXT:
${JSON.stringify(input.context, null, 2)}

Provide a clear, actionable answer.`;

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      return completion.choices[0]?.message?.content || 'I cannot answer that question at this time.';
    } catch (error) {
      console.error('OperationsAIDirector answerVoiceQuery error:', error);
      return 'I encountered an error processing your question. Please try again.';
    }
  }
}






















