/**
 * Block 234000 — SmartSend AI Models v1
 * 
 * Three core AI models:
 * - Model A: PersonalizeAI — Email/message personalization
 * - Model B: PredictAI — Lead scoring, job forecasting, safety prediction
 * - Model C: InsuranceAI — Supplement justification generation
 */

import { openai } from './openai'

// ============================================================================
// MODEL A — PersonalizeAI
// ============================================================================

export interface PersonalizeInput {
  homeownerInfo: {
    firstName?: string
    lastName?: string
    email?: string
    address?: string
    city?: string
    state?: string
    phone?: string
  }
  localContext?: {
    city?: string
    state?: string
    neighborhood?: string
    recentWeather?: string
    localReferences?: string[]
  }
  companyBrandVoice?: {
    tone?: 'professional' | 'casual' | 'friendly' | 'formal'
    companyName?: string
    specialties?: string[]
  }
  jobType?: string
  recentConversationHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp?: string
  }>
  contentType: 'email' | 'proposal_intro' | 'contract_explanation' | 'customer_message'
}

export interface PersonalizeOutput {
  subject?: string
  body: string
  smsOption?: string
  tone: string
  personalizationScore: number // 0-100
}

export class PersonalizeAI {
  /**
   * Generate personalized email/message content
   */
  static async personalize(input: PersonalizeInput): Promise<PersonalizeOutput> {
    const {
      homeownerInfo,
      localContext,
      companyBrandVoice,
      jobType,
      recentConversationHistory,
      contentType
    } = input

    const systemPrompt = `You are PersonalizeAI, an expert at writing personalized, engaging content for roofing contractors communicating with homeowners.

Your goal is to create content that:
- Feels personal and authentic (not templated)
- Uses local context naturally
- Matches the company's brand voice
- Addresses the homeowner's specific situation
- Builds trust and rapport

Content types:
- email: Full email with subject and body
- proposal_intro: Introduction paragraph for a proposal
- contract_explanation: Explanation of contract terms in plain language
- customer_message: Short, friendly message (SMS or email)

Always be professional, helpful, and focused on the homeowner's needs.`

    const userPrompt = `Generate ${contentType} content with the following context:

HOMEOWNER INFO:
${JSON.stringify(homeownerInfo, null, 2)}

LOCAL CONTEXT:
${JSON.stringify(localContext || {}, null, 2)}

COMPANY BRAND VOICE:
${JSON.stringify(companyBrandVoice || {}, null, 2)}

JOB TYPE: ${jobType || 'Not specified'}

RECENT CONVERSATION:
${recentConversationHistory ? JSON.stringify(recentConversationHistory.slice(-3), null, 2) : 'None'}

Return JSON with:
- subject (if contentType is email)
- body (main content)
- smsOption (short version for SMS, if applicable)
- tone (the tone used)
- personalizationScore (0-100, how personalized this feels)`

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      })

      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No response from AI')

      const parsed = JSON.parse(response)
      return {
        subject: parsed.subject,
        body: parsed.body || '',
        smsOption: parsed.smsOption,
        tone: parsed.tone || 'professional',
        personalizationScore: parsed.personalizationScore || 70
      }
    } catch (error) {
      console.error('PersonalizeAI error:', error)
      // Fallback
      return {
        body: `Hi ${homeownerInfo.firstName || 'there'},\n\nThank you for your interest. We're here to help with your roofing needs.\n\nBest regards`,
        tone: 'professional',
        personalizationScore: 50
      }
    }
  }
}

// ============================================================================
// MODEL B — PredictAI
// ============================================================================

export interface LeadScoringInput {
  leadAttributes: {
    email?: string
    firstName?: string
    lastName?: string
    phone?: string
    source?: string
    status?: string
    createdAt?: string
  }
  homeownerBehavior?: {
    proposalOpens?: number
    proposalClicks?: number
    emailReplies?: number
    callLogs?: number
    lastActivity?: string
  }
  historicalJobData?: Array<{
    jobValue: number
    closed: boolean
    daysToClose?: number
  }>
}

export interface LeadScoringOutput {
  score: number // 0-100
  confidence: number // 0-1
  classification: 'hot' | 'warm' | 'cold'
  reason: string
  factors: string[]
}

export interface JobForecastInput {
  jobData: {
    jobValue?: number
    estimatedCost?: number
    jobType?: string
    roofType?: string
    squareFootage?: number
    complexity?: 'simple' | 'moderate' | 'complex'
  }
  crewHistory?: Array<{
    crewId: string
    avgJobDuration?: number
    avgCostVariance?: number
    safetyIncidents?: number
  }>
  materialHistory?: Array<{
    materialType: string
    estimatedCost?: number
    actualCost?: number
    variance?: number
  }>
  weatherData?: {
    forecast?: string
    historicalDelays?: number
  }
}

export interface JobForecastOutput {
  predictedProfit: number
  predictedMargin: number // percentage
  predictedCost: number
  riskLevel: 'low' | 'medium' | 'high'
  riskFactors: string[]
  recommendations: string[]
}

export interface SafetyPredictionInput {
  crewId?: string
  jobId?: string
  crewHistory?: {
    previousIncidents?: number
    ppeCompliance?: number // 0-1
    trainingLevel?: string
  }
  jobConditions?: {
    height?: number
    weather?: string
    complexity?: string
  }
  recentSafetyIssues?: Array<{
    type: string
    severity: 'low' | 'medium' | 'high'
    date?: string
  }>
}

export interface SafetyPredictionOutput {
  riskScore: number // 0-100
  riskFactors: string[]
  recommendedActions: string[]
}

export class PredictAI {
  /**
   * Score a lead (predict close probability)
   */
  static async scoreLead(input: LeadScoringInput): Promise<LeadScoringOutput> {
    const systemPrompt = `You are PredictAI, an expert at analyzing lead data to predict close probability for roofing contractors.

Analyze lead attributes, homeowner behavior, and historical patterns to score leads from 0-100:
- 80-100: Hot lead (high close probability)
- 50-79: Warm lead (moderate close probability)
- 0-49: Cold lead (low close probability)

Consider factors like:
- Engagement level (email opens, replies, calls)
- Lead source quality
- Time since last activity
- Historical conversion patterns
- Lead status and stage`

    const userPrompt = `Score this lead:

LEAD ATTRIBUTES:
${JSON.stringify(input.leadAttributes, null, 2)}

HOMEOWNER BEHAVIOR:
${JSON.stringify(input.homeownerBehavior || {}, null, 2)}

HISTORICAL JOB DATA:
${JSON.stringify(input.historicalJobData || [], null, 2)}

Return JSON with:
- score (0-100)
- confidence (0-1)
- classification (hot/warm/cold)
- reason (explanation)
- factors (array of key factors)`

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
      })

      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No response from AI')

      const parsed = JSON.parse(response)
      
      // Ensure classification matches score
      let classification: 'hot' | 'warm' | 'cold' = 'cold'
      if (parsed.score >= 80) classification = 'hot'
      else if (parsed.score >= 50) classification = 'warm'

      return {
        score: Math.max(0, Math.min(100, parsed.score || 50)),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        classification,
        reason: parsed.reason || 'AI analysis completed',
        factors: parsed.factors || []
      }
    } catch (error) {
      console.error('PredictAI scoreLead error:', error)
      return {
        score: 50,
        confidence: 0.3,
        classification: 'warm',
        reason: 'Unable to analyze lead - using default score',
        factors: []
      }
    }
  }

  /**
   * Forecast job profitability
   */
  static async forecastJob(input: JobForecastInput): Promise<JobForecastOutput> {
    const systemPrompt = `You are PredictAI, an expert at forecasting job profitability and risk for roofing contractors.

Analyze job data, crew history, material patterns, and weather to predict:
- Profit (revenue - costs)
- Margin (profit / revenue * 100)
- Risk level (low/medium/high)
- Risk factors (material overruns, labor variance, weather delays, etc.)
- Recommendations (change orders, crew adjustments, etc.)`

    const userPrompt = `Forecast this job:

JOB DATA:
${JSON.stringify(input.jobData, null, 2)}

CREW HISTORY:
${JSON.stringify(input.crewHistory || [], null, 2)}

MATERIAL HISTORY:
${JSON.stringify(input.materialHistory || [], null, 2)}

WEATHER DATA:
${JSON.stringify(input.weatherData || {}, null, 2)}

Return JSON with:
- predictedProfit (number)
- predictedMargin (percentage)
- predictedCost (number)
- riskLevel (low/medium/high)
- riskFactors (array of strings)
- recommendations (array of strings)`

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
      })

      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No response from AI')

      const parsed = JSON.parse(response)
      
      return {
        predictedProfit: parsed.predictedProfit || 0,
        predictedMargin: parsed.predictedMargin || 0,
        predictedCost: parsed.predictedCost || 0,
        riskLevel: parsed.riskLevel || 'medium',
        riskFactors: parsed.riskFactors || [],
        recommendations: parsed.recommendations || []
      }
    } catch (error) {
      console.error('PredictAI forecastJob error:', error)
      return {
        predictedProfit: 0,
        predictedMargin: 0,
        predictedCost: 0,
        riskLevel: 'medium',
        riskFactors: ['Unable to analyze job'],
        recommendations: []
      }
    }
  }

  /**
   * Predict safety risk
   */
  static async predictSafety(input: SafetyPredictionInput): Promise<SafetyPredictionOutput> {
    const systemPrompt = `You are PredictAI, an expert at predicting safety risks for roofing crews.

Analyze crew history, job conditions, and recent safety issues to predict:
- Risk score (0-100, higher = more risk)
- Risk factors (missing PPE, previous incidents, weather, height, etc.)
- Recommended actions (PPE reinforcement, additional training, crew reassignment, etc.)`

    const userPrompt = `Predict safety risk:

CREW HISTORY:
${JSON.stringify(input.crewHistory || {}, null, 2)}

JOB CONDITIONS:
${JSON.stringify(input.jobConditions || {}, null, 2)}

RECENT SAFETY ISSUES:
${JSON.stringify(input.recentSafetyIssues || [], null, 2)}

Return JSON with:
- riskScore (0-100)
- riskFactors (array of strings)
- recommendedActions (array of strings)`

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
      })

      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No response from AI')

      const parsed = JSON.parse(response)
      
      return {
        riskScore: Math.max(0, Math.min(100, parsed.riskScore || 50)),
        riskFactors: parsed.riskFactors || [],
        recommendedActions: parsed.recommendedActions || []
      }
    } catch (error) {
      console.error('PredictAI predictSafety error:', error)
      return {
        riskScore: 50,
        riskFactors: ['Unable to analyze safety risk'],
        recommendedActions: ['Review crew safety protocols']
      }
    }
  }

  /**
   * Predict production delays
   */
  static async predictProductionDelay(input: {
    scheduledDate: string
    weatherForecast?: string
    crewHistory?: Array<{ crewId: string; avgDelayDays?: number }>
    materialDeliveryPatterns?: Array<{ materialType: string; avgDelayDays?: number }>
  }): Promise<{
    delayProbability: number // 0-1
    predictedDelayDays: number
    reasons: string[]
  }> {
    const systemPrompt = `You are PredictAI, an expert at predicting production delays for roofing jobs.

Analyze weather, crew history, and material delivery patterns to predict delays.`

    const userPrompt = `Predict production delay:

SCHEDULED DATE: ${input.scheduledDate}
WEATHER FORECAST: ${input.weatherForecast || 'Not provided'}
CREW HISTORY: ${JSON.stringify(input.crewHistory || [], null, 2)}
MATERIAL DELIVERY PATTERNS: ${JSON.stringify(input.materialDeliveryPatterns || [], null, 2)}

Return JSON with:
- delayProbability (0-1)
- predictedDelayDays (number)
- reasons (array of strings)`

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      })

      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No response from AI')

      const parsed = JSON.parse(response)
      
      return {
        delayProbability: Math.max(0, Math.min(1, parsed.delayProbability || 0.3)),
        predictedDelayDays: parsed.predictedDelayDays || 0,
        reasons: parsed.reasons || []
      }
    } catch (error) {
      console.error('PredictAI predictProductionDelay error:', error)
      return {
        delayProbability: 0.3,
        predictedDelayDays: 0,
        reasons: ['Unable to predict delay']
      }
    }
  }
}

// ============================================================================
// MODEL C — InsuranceAI
// ============================================================================

export interface SupplementGenerationInput {
  crewIssues?: Array<{
    issue: string
    severity: 'low' | 'medium' | 'high'
    description?: string
  }>
  xactimateLineItems?: Array<{
    item: string
    quantity?: number
    unitPrice?: number
    total?: number
  }>
  insuranceScope?: {
    total?: number
    lineItems?: Array<{ item: string; amount?: number }>
  }
  jobDetails?: {
    jobType?: string
    roofType?: string
    squareFootage?: number
    damageDescription?: string
  }
  photos?: Array<{ url: string; description?: string }> // Future: vision model
}

export interface SupplementGenerationOutput {
  justification: string
  codeReferences: Array<{ code: string; description: string }>
  xactimateLogic: string
  missingItems: Array<{ item: string; reason: string; estimatedCost?: number }>
}

export class InsuranceAI {
  /**
   * Generate supplement justification
   */
  static async generateSupplementJustification(
    input: SupplementGenerationInput
  ): Promise<SupplementGenerationOutput> {
    const systemPrompt = `You are InsuranceAI, an expert at generating bulletproof insurance supplement justifications for roofing contractors.

Your goal is to create supplement documents that:
- Clearly explain why additional items are needed
- Reference building codes and industry standards
- Use Xactimate logic and terminology
- Include crew issues and photos as evidence
- Make a compelling case for approval

Be professional, detailed, and persuasive. Reference specific codes when possible.`

    const userPrompt = `Generate supplement justification:

CREW ISSUES:
${JSON.stringify(input.crewIssues || [], null, 2)}

XACTIMATE LINE ITEMS:
${JSON.stringify(input.xactimateLineItems || [], null, 2)}

INSURANCE SCOPE:
${JSON.stringify(input.insuranceScope || {}, null, 2)}

JOB DETAILS:
${JSON.stringify(input.jobDetails || {}, null, 2)}

Return JSON with:
- justification (full justification text, 2-3 paragraphs)
- codeReferences (array of {code, description})
- xactimateLogic (explanation using Xactimate terminology)
- missingItems (array of {item, reason, estimatedCost})`

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      })

      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No response from AI')

      const parsed = JSON.parse(response)
      
      return {
        justification: parsed.justification || 'Supplement justification generated',
        codeReferences: parsed.codeReferences || [],
        xactimateLogic: parsed.xactimateLogic || '',
        missingItems: parsed.missingItems || []
      }
    } catch (error) {
      console.error('InsuranceAI generateSupplementJustification error:', error)
      return {
        justification: 'Unable to generate supplement justification. Please review crew issues and scope manually.',
        codeReferences: [],
        xactimateLogic: '',
        missingItems: []
      }
    }
  }
}

// ============================================================================
// UTILITY: Summarize Customer Message
// ============================================================================

export interface SummarizeInput {
  message: string
  context?: {
    previousMessages?: string[]
    jobId?: string
    leadId?: string
  }
}

export interface SummarizeOutput {
  summary: string
  recommendedResponse: string
  urgency: 'low' | 'medium' | 'high'
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated'
}

export async function summarizeCustomerMessage(
  input: SummarizeInput
): Promise<SummarizeOutput> {
  const systemPrompt = `You are an expert at analyzing customer messages for roofing contractors.

Analyze the message and provide:
- Short summary (1-2 sentences)
- Recommended response (brief, friendly, helpful)
- Urgency level (low/medium/high)
- Sentiment (positive/neutral/negative/frustrated)

Be concise and actionable.`

  const userPrompt = `Analyze this customer message:

MESSAGE:
${input.message}

CONTEXT:
${JSON.stringify(input.context || {}, null, 2)}

Return JSON with:
- summary (short summary)
- recommendedResponse (brief response suggestion)
- urgency (low/medium/high)
- sentiment (positive/neutral/negative/frustrated)`

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 400,
      response_format: { type: 'json_object' }
    })

    const response = completion.choices[0]?.message?.content
    if (!response) throw new Error('No response from AI')

    const parsed = JSON.parse(response)
    
    return {
      summary: parsed.summary || 'Message received',
      recommendedResponse: parsed.recommendedResponse || 'Thank you for your message. We will get back to you soon.',
      urgency: parsed.urgency || 'medium',
      sentiment: parsed.sentiment || 'neutral'
    }
  } catch (error) {
    console.error('summarizeCustomerMessage error:', error)
    return {
      summary: 'Unable to analyze message',
      recommendedResponse: 'Thank you for your message. We will get back to you soon.',
      urgency: 'medium',
      sentiment: 'neutral'
    }
  }
}

























