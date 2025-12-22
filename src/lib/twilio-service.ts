import { Twilio } from 'twilio';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class TwilioService {
  private twilio: Twilio;

  constructor() {
    this.twilio = new Twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
  }

  async sendSMS(
    to: string,
    message: string,
    from?: string
  ): Promise<{ success: boolean; messageSid?: string; error?: string }> {
    try {
      const phoneNumber = from || await this.getDefaultPhoneNumber();
      
      const messageResponse = await this.twilio.messages.create({
        body: message,
        from: phoneNumber,
        to: to
      });

      return {
        success: true,
        messageSid: messageResponse.sid
      };
    } catch (error) {
      console.error('SMS sending error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async makeCall(
    to: string,
    twimlUrl: string,
    from?: string
  ): Promise<{ success: boolean; callSid?: string; error?: string }> {
    try {
      const phoneNumber = from || await this.getDefaultPhoneNumber();
      
      const call = await this.twilio.calls.create({
        to: to,
        from: phoneNumber,
        url: twimlUrl
      });

      return {
        success: true,
        callSid: call.sid
      };
    } catch (error) {
      console.error('Call making error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async generateTwiMLForCall(
    conversationId: string,
    industry: string
  ): Promise<string> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smartsend.ai';
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Hello! Thank you for calling. I'm your AI assistant. How can I help you today?</Say>
    <Gather input="speech" action="${baseUrl}/api/twilio/voice/process" method="POST" timeout="10">
        <Say voice="alice">Please tell me what you need help with.</Say>
    </Gather>
    <Say voice="alice">I didn't catch that. Let me transfer you to our team.</Say>
    <Dial>+1234567890</Dial>
</Response>`;
  }

  async generateTwiMLForSMS(
    conversationId: string,
    industry: string
  ): Promise<string> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://smartsend.ai';
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>Hello! Thanks for texting us. I'm your AI assistant. How can I help you today?</Message>
</Response>`;
  }

  async handleIncomingSMS(
    from: string,
    body: string,
    messageSid: string
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
      // Find or create contact
      const contact = await this.findOrCreateContact(from);
      if (!contact) {
        return { success: false, error: 'Failed to find or create contact' };
      }

      // Find or create conversation
      const conversation = await this.findOrCreateConversation(
        contact.id,
        'sms',
        from
      );
      if (!conversation) {
        return { success: false, error: 'Failed to find or create conversation' };
      }

      // Save incoming message
      await supabase
        .from('ai_conversation_messages')
        .insert({
          conversation_id: conversation.id,
          message_type: 'inbound',
          content: body,
          twilio_message_sid: messageSid
        });

      // Process with AI
      const aiReceptionist = await import('./ai-receptionist').then(m => 
        m.createAIReceptionist(conversation.industry || 'general')
      );

      const context = {
        conversationId: conversation.id,
        userId: conversation.user_id,
        contactId: contact.id,
        industry: conversation.industry || 'general',
        conversationType: 'sms' as const,
        phoneNumber: from,
        previousMessages: await this.getConversationHistory(conversation.id)
      };

      const aiResponse = await aiReceptionist.processMessage(context, body);

      // Save AI response
      await supabase
        .from('ai_conversation_messages')
        .insert({
          conversation_id: conversation.id,
          message_type: 'ai_generated',
          content: aiResponse.message
        });

      // Send SMS response
      const smsResult = await this.sendSMS(from, aiResponse.message);
      if (!smsResult.success) {
        return { success: false, error: smsResult.error };
      }

      // Handle meeting booking if needed
      if (aiResponse.shouldBookMeeting) {
        // This would typically be handled by a separate webhook or queue
        // For now, we'll just log it
        console.log('Meeting booking requested for conversation:', conversation.id);
      }

      return {
        success: true,
        response: aiResponse.message
      };
    } catch (error) {
      console.error('SMS handling error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async handleIncomingCall(
    from: string,
    callSid: string
  ): Promise<{ success: boolean; twiml?: string; error?: string }> {
    try {
      // Find or create contact
      const contact = await this.findOrCreateContact(from);
      if (!contact) {
        return { success: false, error: 'Failed to find or create contact' };
      }

      // Find or create conversation
      const conversation = await this.findOrCreateConversation(
        contact.id,
        'call',
        from
      );
      if (!conversation) {
        return { success: false, error: 'Failed to find or create conversation' };
      }

      // Generate TwiML for the call
      const twiml = await this.generateTwiMLForCall(conversation.id, conversation.industry || 'general');

      return {
        success: true,
        twiml
      };
    } catch (error) {
      console.error('Call handling error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getDefaultPhoneNumber(): Promise<string> {
    const { data: phoneNumber } = await supabase
      .from('twilio_phone_numbers')
      .select('phone_number')
      .eq('is_active', true)
      .single();

    if (!phoneNumber) {
      throw new Error('No active Twilio phone number found');
    }

    return phoneNumber.phone_number;
  }

  private async findOrCreateContact(phoneNumber: string): Promise<any> {
    // First try to find existing contact
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('*')
      .eq('phone', phoneNumber)
      .single();

    if (existingContact) {
      return existingContact;
    }

    // Create new contact
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({
        phone: phoneNumber,
        source: 'inbound_call'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating contact:', error);
      return null;
    }

    return newContact;
  }

  private async findOrCreateConversation(
    contactId: string,
    type: 'sms' | 'call' | 'email',
    phoneNumber: string
  ): Promise<any> {
    // First try to find existing active conversation
    const { data: existingConversation } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('contact_id', contactId)
      .eq('conversation_type', type)
      .eq('status', 'active')
      .single();

    if (existingConversation) {
      return existingConversation;
    }

    // Get contact's user_id
    const { data: contact } = await supabase
      .from('contacts')
      .select('user_id')
      .eq('id', contactId)
      .single();

    if (!contact) {
      return null;
    }

    // Create new conversation
    const { data: newConversation, error } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: contact.user_id,
        contact_id: contactId,
        conversation_type: type,
        phone_number: phoneNumber,
        industry: 'general' // This should be determined from user settings
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return null;
    }

    return newConversation;
  }

  private async getConversationHistory(conversationId: string): Promise<Array<{role: string, content: string, timestamp: string}>> {
    const { data: messages } = await supabase
      .from('ai_conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (!messages) return [];

    return messages.map(msg => ({
      role: msg.message_type === 'inbound' ? 'user' : 'assistant',
      content: msg.content,
      timestamp: msg.created_at
    }));
  }
}

export const twilioService = new TwilioService();