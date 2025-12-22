import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AIConversationContext {
  conversationId: string;
  userId: string;
  contactId: string;
  industry: string;
  conversationType: 'sms' | 'call' | 'email';
  phoneNumber?: string;
  previousMessages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }>;
}

export interface AIResponse {
  message: string;
  shouldBookMeeting: boolean;
  meetingIntent: boolean;
  nextAction: 'continue' | 'book_meeting' | 'escalate' | 'end';
  confidence: number;
}

export class AIReceptionist {
  private industry: string;
  private script: any;

  constructor(industry: string) {
    this.industry = industry;
  }

  async loadScript(userId: string): Promise<void> {
    const { data: script } = await supabase
      .from('ai_scripts')
      .select('script_content')
      .eq('industry', this.industry)
      .eq('is_active', true)
      .single();

    if (script) {
      this.script = script.script_content;
    } else {
      // Fallback to default script
      this.script = this.getDefaultScript();
    }
  }

  async processMessage(
    context: AIConversationContext,
    userMessage: string
  ): Promise<AIResponse> {
    await this.loadScript(context.userId);

    const systemPrompt = this.buildSystemPrompt(context);
    const conversationHistory = this.buildConversationHistory(context.previousMessages);

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const response = completion.choices[0]?.message?.content || '';
      
      // Analyze the response for meeting intent
      const meetingIntent = this.detectMeetingIntent(userMessage, response);
      const shouldBookMeeting = meetingIntent && this.script.booking_flow;

      return {
        message: response,
        shouldBookMeeting,
        meetingIntent,
        nextAction: shouldBookMeeting ? 'book_meeting' : 'continue',
        confidence: 0.8
      };
    } catch (error) {
      console.error('AI Receptionist error:', error);
      return {
        message: this.script?.fallback || "I'm sorry, I'm having trouble right now. Let me have someone call you back.",
        shouldBookMeeting: false,
        meetingIntent: false,
        nextAction: 'escalate',
        confidence: 0.1
      };
    }
  }

  private buildSystemPrompt(context: AIConversationContext): string {
    const industryScript = this.script || this.getDefaultScript();
    
    return `You are an AI receptionist for a ${this.industry} business. Your role is to:

1. Greet customers warmly and professionally
2. Qualify their needs using the provided questions
3. Identify when they want to book a meeting/appointment
4. Book meetings when appropriate
5. Escalate complex issues to human staff

Industry: ${this.industry}
Greeting: ${industryScript.greeting}
Qualifying Questions: ${JSON.stringify(industryScript.qualifying_questions)}
Booking Flow: ${JSON.stringify(industryScript.booking_flow)}

Guidelines:
- Keep responses concise and friendly
- Ask one question at a time
- Look for booking keywords: ${industryScript.booking_flow?.trigger_phrases?.join(', ')}
- If they want to book, ask for their preferred date/time
- If unsure, ask clarifying questions
- Always be helpful and professional

Current conversation type: ${context.conversationType}`;
  }

  private buildConversationHistory(messages: Array<{role: string, content: string, timestamp: string}>): Array<{role: 'user' | 'assistant' | 'system', content: string}> {
    return messages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content
    }));
  }

  private detectMeetingIntent(userMessage: string, aiResponse: string): boolean {
    const bookingKeywords = this.script?.booking_flow?.trigger_phrases || [
      'schedule', 'appointment', 'meeting', 'book', 'consultation', 'call'
    ];
    
    const userLower = userMessage.toLowerCase();
    const responseLower = aiResponse.toLowerCase();
    
    return bookingKeywords.some(keyword => 
      userLower.includes(keyword) || responseLower.includes(keyword)
    );
  }

  private getDefaultScript() {
    return {
      greeting: "Hello! Thank you for reaching out. How can I help you today?",
      qualifying_questions: [
        "What can I help you with today?",
        "Is this something that needs immediate attention?"
      ],
      booking_flow: {
        trigger_phrases: ["schedule", "appointment", "meeting", "book"],
        response: "I'd be happy to schedule that for you. What day and time works best?",
        confirmation: "Perfect! I've scheduled your appointment for [DATE] at [TIME]."
      },
      fallback: "I understand you need assistance. Let me have someone call you back within the hour."
    };
  }

  async bookMeeting(
    conversationId: string,
    contactId: string,
    userId: string,
    meetingDateTime: string,
    meetingType?: string,
    notes?: string
  ): Promise<{ success: boolean; meetingId?: string; error?: string }> {
    try {
      const { data: meeting, error } = await supabase
        .from('meeting_bookings')
        .insert({
          conversation_id: conversationId,
          contact_id: contactId,
          user_id: userId,
          meeting_datetime: meetingDateTime,
          meeting_type: meetingType || 'consultation',
          meeting_notes: notes,
          status: 'scheduled'
        })
        .select()
        .single();

      if (error) throw error;

      // Update conversation status
      await supabase
        .from('ai_conversations')
        .update({
          meeting_booked: true,
          meeting_datetime: meetingDateTime,
          status: 'completed'
        })
        .eq('id', conversationId);

      return { success: true, meetingId: meeting.id };
    } catch (error) {
      console.error('Meeting booking error:', error);
      return { success: false, error: 'Failed to book meeting' };
    }
  }

  async saveConversationMessage(
    conversationId: string,
    messageType: 'inbound' | 'outbound' | 'ai_generated',
    content: string,
    metadata?: any
  ): Promise<void> {
    try {
      await supabase
        .from('ai_conversation_messages')
        .insert({
          conversation_id: conversationId,
          message_type: messageType,
          content,
          metadata
        });
    } catch (error) {
      console.error('Error saving conversation message:', error);
    }
  }
}

export const createAIReceptionist = (industry: string) => {
  return new AIReceptionist(industry);
};