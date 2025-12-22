export interface IntentRule {
  id: string;
  name: string;
  keywords: string[];
  patterns: RegExp[];
  score: number;
  category: 'meeting' | 'interested' | 'not_interested' | 'question' | 'other';
  actions: string[];
}

export interface IntentResult {
  detected: boolean;
  confidence: number;
  category: string;
  actions: string[];
  matchedRules: IntentRule[];
  extractedData: Record<string, any>;
}

export interface OpenAIResponse {
  intent: string;
  confidence: number;
  category: string;
  actions: string[];
  extractedData: Record<string, any>;
}

export class IntentDetector {
  private rules: IntentRule[] = [];
  private openaiApiKey?: string;

  constructor(openaiApiKey?: string) {
    this.openaiApiKey = openaiApiKey;
    this.initializeDefaultRules();
  }

  private initializeDefaultRules() {
    this.rules = [
      // Meeting intent rules
      {
        id: 'meeting_1',
        name: 'Direct meeting request',
        keywords: ['meeting', 'call', 'schedule', 'book', 'calendar', 'appointment'],
        patterns: [
          /(?:can we|let's|i'd like to|i want to)\s+(?:have a|schedule a|book a)\s+(?:meeting|call)/i,
          /(?:meeting|call)\s+(?:at|for)\s+\d{1,2}:\d{2}/i,
          /(?:available|free)\s+(?:on|at)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        ],
        score: 0.9,
        category: 'meeting',
        actions: ['schedule_meeting', 'send_calendar_invite'],
      },
      {
        id: 'meeting_2',
        name: 'Time availability',
        keywords: ['available', 'free', 'time', 'when', 'what time'],
        patterns: [
          /(?:when|what time)\s+(?:are you|is|do you have)\s+(?:available|free)/i,
          /(?:i'm|i am)\s+(?:available|free)\s+(?:on|at|this)/i,
        ],
        score: 0.8,
        category: 'meeting',
        actions: ['send_availability', 'schedule_meeting'],
      },
      {
        id: 'meeting_3',
        name: 'Calendar coordination',
        keywords: ['calendar', 'outlook', 'google', 'zoom', 'teams'],
        patterns: [
          /(?:send|share)\s+(?:your|a)\s+(?:calendar|availability)/i,
          /(?:zoom|teams|google meet|skype)\s+(?:link|invite)/i,
        ],
        score: 0.85,
        category: 'meeting',
        actions: ['send_calendar_invite', 'share_availability'],
      },

      // Interest intent rules
      {
        id: 'interested_1',
        name: 'Product interest',
        keywords: ['interested', 'pricing', 'demo', 'trial', 'more info'],
        patterns: [
          /(?:i'm|i am)\s+(?:interested|curious)/i,
          /(?:can you|please)\s+(?:send|provide)\s+(?:pricing|more information)/i,
          /(?:how much|what's the cost|pricing)/i,
        ],
        score: 0.8,
        category: 'interested',
        actions: ['send_pricing', 'schedule_demo', 'send_more_info'],
      },
      {
        id: 'interested_2',
        name: 'Feature questions',
        keywords: ['feature', 'how does', 'can it', 'does it'],
        patterns: [
          /(?:how does|can it|does it)\s+(?:work|handle|support)/i,
          /(?:what|which)\s+(?:features|capabilities)/i,
        ],
        score: 0.7,
        category: 'interested',
        actions: ['send_feature_info', 'schedule_demo'],
      },

      // Not interested rules
      {
        id: 'not_interested_1',
        name: 'Direct rejection',
        keywords: ['not interested', 'no thanks', 'pass', 'not for us'],
        patterns: [
          /(?:not|no)\s+(?:interested|thanks|thank you)/i,
          /(?:pass|not for us|not a fit)/i,
        ],
        score: 0.9,
        category: 'not_interested',
        actions: ['remove_from_list', 'send_followup_later'],
      },

      // Question rules
      {
        id: 'question_1',
        name: 'General questions',
        keywords: ['question', 'how', 'what', 'why', 'when'],
        patterns: [
          /(?:i have|got a)\s+(?:question|inquiry)/i,
          /(?:how|what|why|when)\s+(?:do|does|can|is)/i,
        ],
        score: 0.6,
        category: 'question',
        actions: ['answer_question', 'schedule_call'],
      },
    ];
  }

  /**
   * Detect intent from email content using rule-based approach
   */
  async detectIntent(content: string): Promise<IntentResult> {
    const normalizedContent = content.toLowerCase().trim();
    let maxScore = 0;
    let matchedRules: IntentRule[] = [];
    let bestCategory = 'other';
    let bestActions: string[] = [];

    // Check each rule
    for (const rule of this.rules) {
      let ruleScore = 0;

      // Check keywords
      for (const keyword of rule.keywords) {
        if (normalizedContent.includes(keyword.toLowerCase())) {
          ruleScore += rule.score * 0.3;
        }
      }

      // Check patterns
      for (const pattern of rule.patterns) {
        if (pattern.test(normalizedContent)) {
          ruleScore += rule.score * 0.7;
        }
      }

      if (ruleScore > 0) {
        matchedRules.push(rule);
        if (ruleScore > maxScore) {
          maxScore = ruleScore;
          bestCategory = rule.category;
          bestActions = rule.actions;
        }
      }
    }

    // Extract common data
    const extractedData = this.extractCommonData(normalizedContent);

    return {
      detected: maxScore > 0.3,
      confidence: Math.min(maxScore, 1.0),
      category: bestCategory,
      actions: bestActions,
      matchedRules,
      extractedData,
    };
  }

  /**
   * Detect intent using OpenAI for more accurate classification
   */
  async detectIntentWithAI(content: string): Promise<IntentResult> {
    if (!this.openaiApiKey) {
      return this.detectIntent(content);
    }

    try {
      const aiResponse = await this.callOpenAI(content);
      
      return {
        detected: true,
        confidence: aiResponse.confidence,
        category: aiResponse.category,
        actions: aiResponse.actions,
        matchedRules: [],
        extractedData: aiResponse.extractedData,
      };
    } catch (error) {
      console.error('OpenAI intent detection failed, falling back to rules:', error);
      return this.detectIntent(content);
    }
  }

  /**
   * Add custom intent rules
   */
  addRule(rule: IntentRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(rule => rule.id !== ruleId);
  }

  /**
   * Get all rules
   */
  getRules(): IntentRule[] {
    return [...this.rules];
  }

  /**
   * Extract common data from email content
   */
  private extractCommonData(content: string): Record<string, any> {
    const data: Record<string, any> = {};

    // Extract time mentions
    const timeMatches = content.match(/(\d{1,2}:\d{2})\s*(am|pm)?/gi);
    if (timeMatches) {
      data.times = timeMatches;
    }

    // Extract date mentions
    const dateMatches = content.match(/(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi);
    if (dateMatches) {
      data.days = dateMatches;
    }

    // Extract urgency indicators
    const urgencyWords = ['urgent', 'asap', 'quick', 'fast', 'immediate'];
    data.urgent = urgencyWords.some(word => content.includes(word));

    // Extract contact preferences
    const contactMethods = ['phone', 'email', 'text', 'sms', 'whatsapp'];
    data.preferredContact = contactMethods.find(method => content.includes(method));

    return data;
  }

  /**
   * Call OpenAI API for intent detection
   */
  private async callOpenAI(content: string): Promise<OpenAIResponse> {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are an email intent detection system. Analyze the email content and classify the intent. Return a JSON response with:
            - intent: brief description of the intent
            - confidence: number between 0 and 1
            - category: one of "meeting", "interested", "not_interested", "question", "other"
            - actions: array of suggested actions
            - extractedData: any relevant data like times, dates, urgency, etc.`
          },
          {
            role: 'user',
            content: content
          }
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const result = await response.json();
    const responseContent = result.choices[0]?.message?.content;
    
    if (!responseContent) {
      throw new Error('No content in OpenAI response');
    }

    try {
      return JSON.parse(responseContent);
    } catch (error) {
      throw new Error('Invalid JSON response from OpenAI');
    }
  }

  /**
   * Check if content contains meeting intent
   */
  async isMeetingIntent(content: string): Promise<boolean> {
    const result = await this.detectIntent(content);
    return result.category === 'meeting' && result.confidence > 0.5;
  }

  /**
   * Get suggested actions for detected intent
   */
  async getSuggestedActions(content: string): Promise<string[]> {
    const result = await this.detectIntent(content);
    return result.actions;
  }
}

// Utility functions
export function createIntentDetector(openaiApiKey?: string): IntentDetector {
  return new IntentDetector(openaiApiKey);
}

export function detectMeetingIntent(content: string): Promise<boolean> {
  const detector = new IntentDetector();
  return detector.isMeetingIntent(content);
}

export function getIntentActions(content: string): Promise<string[]> {
  const detector = new IntentDetector();
  return detector.getSuggestedActions(content);
} 