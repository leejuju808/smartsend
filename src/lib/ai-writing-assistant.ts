import { openai } from './openai'
import { AISuggestion, AIOptimizationResult } from '@/types/database'

export interface EmailContent {
  subject: string
  body: string
  tone: string
  targetAudience: string
  productService: string
}

export interface OptimizationRequest {
  content: EmailContent
  focusAreas?: ('subject' | 'body' | 'tone' | 'personalization')[]
  targetScore?: number
}

export class AIWritingAssistant {
  /**
   * Generate AI-powered suggestions for email optimization
   */
  static async generateSuggestions(request: OptimizationRequest): Promise<AIOptimizationResult> {
    const { content, focusAreas = ['subject', 'body', 'tone'], targetScore = 80 } = request
    
    try {
      const suggestions: AISuggestion[] = []
      
      // Generate suggestions for each focus area
      for (const area of focusAreas) {
        const areaSuggestions = await this.generateSuggestionsForArea(content, area, targetScore)
        suggestions.push(...areaSuggestions)
      }
      
      // Calculate overall score
      const overallScore = Math.round(
        suggestions.reduce((sum, s) => sum + s.score, 0) / suggestions.length
      )
      
      // Generate performance notes
      const performanceNotes = await this.generatePerformanceNotes(content, suggestions, overallScore)
      
      return {
        suggestions,
        overall_score: overallScore,
        performance_notes: performanceNotes
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error)
      throw new Error('Failed to generate AI suggestions')
    }
  }

  /**
   * Generate suggestions for a specific area
   */
  private static async generateSuggestionsForArea(
    content: EmailContent,
    area: 'subject' | 'body' | 'tone' | 'personalization',
    targetScore: number
  ): Promise<AISuggestion[]> {
    const prompts = {
      subject: `Analyze and improve this email subject line for better open rates:
Current: "${content.subject}"
Target Audience: ${content.targetAudience}
Product/Service: ${content.productService}
Tone: ${content.tone}

Provide 3 improved versions with:
1. Higher curiosity factor
2. Better personalization
3. Clearer value proposition

Score each from 0-100 based on:
- Curiosity (25 points)
- Personalization (25 points)
- Clarity (25 points)
- Actionability (25 points)`,

      body: `Analyze and improve this email body for better engagement:
Current: "${content.body}"
Target Audience: ${content.targetAudience}
Product/Service: ${content.productService}
Tone: ${content.tone}

Provide 3 improved versions with:
1. More persuasive language
2. Better structure and flow
3. Stronger call-to-action

Score each from 0-100 based on:
- Persuasiveness (25 points)
- Structure (25 points)
- Personalization (25 points)
- Call-to-action (25 points)`,

      tone: `Analyze and suggest tone improvements for this email:
Current Tone: ${content.tone}
Content: "${content.body}"
Target Audience: ${content.targetAudience}
Product/Service: ${content.productService}

Suggest 3 alternative tones that might work better:
1. More professional/formal
2. More casual/friendly
3. More direct/assertive

Score each from 0-100 based on:
- Audience fit (40 points)
- Industry appropriateness (30 points)
- Goal alignment (30 points)`,

      personalization: `Analyze personalization opportunities for this email:
Content: "${content.body}"
Target Audience: ${content.targetAudience}
Product/Service: ${content.productService}

Suggest 3 personalization improvements:
1. Dynamic token insertion ({{first_name}}, {{company}})
2. Industry-specific references
3. Pain point personalization

Score each from 0-100 based on:
- Relevance (40 points)
- Implementation ease (30 points)
- Impact potential (30 points)`
    }

    const prompt = prompts[area]
    
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an expert email copywriter and marketing strategist. Analyze the provided content and provide specific, actionable improvements with numerical scores. Format your response as JSON with this structure:
{
  "suggestions": [
    {
      "content": "improved version text",
      "score": 85,
      "reasoning": "brief explanation of why this score"
    }
  ]
}`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      })

      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No response from AI')

      const parsed = JSON.parse(response)
      return parsed.suggestions.map((s: any) => ({
        type: area,
        content: s.content,
        score: s.score,
        reasoning: s.reasoning
      }))
    } catch (error) {
      console.error(`Error generating suggestions for ${area}:`, error)
      // Return fallback suggestions
      return [{
        type: area,
        content: `AI suggestion for ${area} improvement`,
        score: 70,
        reasoning: 'Fallback suggestion due to AI service error'
      }]
    }
  }

  /**
   * Generate performance notes based on suggestions
   */
  private static async generatePerformanceNotes(
    content: EmailContent,
    suggestions: AISuggestion[],
    overallScore: number
  ): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an email performance analyst. Provide brief, actionable insights based on the email content and AI suggestions.'
          },
          {
            role: 'user',
            content: `Analyze this email and provide 2-3 key performance insights:
Email: ${content.body}
Overall AI Score: ${overallScore}/100
Suggestions: ${JSON.stringify(suggestions)}

Keep insights brief and actionable.`
          }
        ],
        temperature: 0.5,
        max_tokens: 300
      })

      return completion.choices[0]?.message?.content || 'AI analysis unavailable'
    } catch (error) {
      console.error('Error generating performance notes:', error)
      return 'Performance analysis temporarily unavailable'
    }
  }

  /**
   * Score existing email content
   */
  static async scoreEmail(content: EmailContent): Promise<number> {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an email effectiveness evaluator. Score emails from 0-100 based on clarity, persuasion, and personalization.'
          },
          {
            role: 'user',
            content: `Score this email from 0-100:
Subject: ${content.subject}
Body: ${content.body}
Tone: ${content.tone}
Target: ${content.targetAudience}
Product: ${content.productService}

Provide only the numerical score (0-100).`
          }
        ],
        temperature: 0.3,
        max_tokens: 10
      })

      const score = parseInt(completion.choices[0]?.message?.content || '70')
      return Math.max(0, Math.min(100, score))
    } catch (error) {
      console.error('Error scoring email:', error)
      return 70 // Default fallback score
    }
  }

  /**
   * Generate personalized content variations
   */
  static async generatePersonalizedVariations(
    baseContent: EmailContent,
    personalizationTokens: string[]
  ): Promise<string[]> {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an email personalization expert. Generate 3 variations of the provided content using the specified personalization tokens.'
          },
          {
            role: 'user',
            content: `Generate 3 personalized variations of this email:
Base Content: ${baseContent.body}
Personalization Tokens: ${personalizationTokens.join(', ')}

Each variation should naturally incorporate the tokens and feel personalized.`
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      })

      const response = completion.choices[0]?.message?.content || ''
      // Split by numbered variations and clean up
      return response
        .split(/\d+\.\s*/)
        .filter(Boolean)
        .map(v => v.trim())
        .slice(0, 3)
    } catch (error) {
      console.error('Error generating personalized variations:', error)
      return [baseContent.body] // Return original as fallback
    }
  }
} 