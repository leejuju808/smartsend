import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface EmailGenerationParams {
  targetAudience: string
  productService: string
  tone: 'professional' | 'casual' | 'friendly' | 'formal'
}

export const generateColdEmails = async (params: EmailGenerationParams) => {
  const { targetAudience, productService, tone } = params

  const prompt = `Generate 3 different cold email drafts for the following scenario:

Target Audience: ${targetAudience}
Product/Service: ${productService}
Tone: ${tone}

Requirements:
- Each email should be 150-200 words
- Focus on value proposition and benefits
- Include a clear call-to-action
- Make it personalized and relevant
- Avoid spammy language
- Use the specified tone throughout

Please provide 3 distinct approaches:
1. Problem-solution focused
2. Social proof and results focused  
3. Curiosity and question focused

Format each email with a subject line and body.`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert copywriter specializing in cold email outreach. Create compelling, personalized emails that drive engagement and conversions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    })

    return completion.choices[0]?.message?.content || 'Failed to generate emails'
  } catch (error) {
    console.error('Error generating emails:', error)
    throw new Error('Failed to generate cold emails')
  }
} 