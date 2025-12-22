import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/src/server/supabase';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'edge';

interface SendMessageRequest {
  session_id: string;
  session_token?: string;
  message: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: SendMessageRequest = await req.json();
    const { session_id, session_token, message } = body;

    if (!session_id || !message) {
      return NextResponse.json(
        { error: 'session_id and message are required' },
        { status: 400 }
      );
    }

    // Verify session exists
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('web_chat_sessions')
      .select('id, workspace_id, company_id, status, intent')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Save visitor message
    const { data: visitorMessage, error: messageError } = await supabaseAdmin
      .from('web_chat_messages')
      .insert({
        session_id: session.id,
        sender: 'visitor',
        message: message.trim(),
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error saving visitor message:', messageError);
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      );
    }

    // Get conversation history
    const { data: history } = await supabaseAdmin
      .from('web_chat_messages')
      .select('sender, message, created_at')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .limit(20); // Last 20 messages for context

    // Get company info for AI context
    let companyInfo = '';
    if (session.company_id) {
      const { data: company } = await supabaseAdmin
        .from('roofing_companies')
        .select('name, address, city, state, phone_number, website')
        .eq('id', session.company_id)
        .single();
      
      if (company) {
        companyInfo = `Company: ${company.name}${company.address ? `, ${company.address}, ${company.city || ''}, ${company.state || ''}` : ''}${company.phone_number ? `, Phone: ${company.phone_number}` : ''}`;
      }
    }

    // Get collected lead data for context
    const { data: leadData } = await supabaseAdmin
      .from('web_chat_lead_data')
      .select('name, email, phone, address, issue_type, urgency_level')
      .eq('session_id', session.id)
      .single();

    // Build AI prompt for roofing chat
    const systemPrompt = `You are a friendly, professional AI assistant for a roofing company. Your goal is to:
1. Answer roofing questions helpfully
2. Collect lead information (name, phone, email, address) naturally through conversation
3. Detect customer intent: estimate_request, emergency_leak, warranty_issue, general_question, shopping_estimates, high_urgency
4. Book appointments when appropriate
5. Be conversational, not robotic

${companyInfo ? `Company Information: ${companyInfo}` : ''}

${leadData ? `Already collected: ${leadData.name ? `Name: ${leadData.name}` : ''} ${leadData.email ? `Email: ${leadData.email}` : ''} ${leadData.phone ? `Phone: ${leadData.phone}` : ''} ${leadData.address ? `Address: ${leadData.address}` : ''}` : ''}

Keep responses SHORT (1-3 sentences max). Be helpful and friendly.`;

    // Build conversation history for AI
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...(history || []).map((msg: any) => ({
        role: (msg.sender === 'visitor' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: msg.message,
      })),
      { role: 'user' as const, content: message },
    ];

    // Get AI response
    let aiResponse = '';
    let detectedIntent: string | null = null;
    let shouldCollectInfo = false;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages as any,
        temperature: 0.7,
        max_tokens: 300,
      });

      aiResponse = completion.choices[0]?.message?.content || "I'm here to help! Could you tell me more about what you need?";

      // Detect intent from message and response
      const intentPrompt = `Analyze this customer message and classify the intent. Return ONLY one of these: estimate_request, emergency_leak, warranty_issue, general_question, shopping_estimates, high_urgency, or null if unclear.

Message: "${message}"

Intent:`;

      const intentCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an intent classifier. Return only the intent label.' },
          { role: 'user', content: intentPrompt },
        ],
        temperature: 0.1,
        max_tokens: 20,
      });

      const intentResult = intentCompletion.choices[0]?.message?.content?.trim().toLowerCase();
      if (intentResult && intentResult !== 'null' && intentResult !== 'unclear') {
        detectedIntent = intentResult;
      }

      // Check if we should collect lead info
      const lowerMessage = message.toLowerCase();
      const hasEstimateIntent = lowerMessage.includes('estimate') || lowerMessage.includes('quote') || lowerMessage.includes('price');
      const hasBookingIntent = lowerMessage.includes('appointment') || lowerMessage.includes('schedule') || lowerMessage.includes('inspection');
      
      if ((hasEstimateIntent || hasBookingIntent) && !leadData?.email) {
        shouldCollectInfo = true;
      }

    } catch (aiError: any) {
      console.error('AI error:', aiError);
      aiResponse = "I'm here to help! Could you tell me more about your roofing needs?";
    }

    // Save AI response
    const { data: aiMessage, error: aiMessageError } = await supabaseAdmin
      .from('web_chat_messages')
      .insert({
        session_id: session.id,
        sender: 'ai',
        message: aiResponse,
        ai_intent: detectedIntent,
        ai_confidence: detectedIntent ? 0.8 : null,
      })
      .select()
      .single();

    if (aiMessageError) {
      console.error('Error saving AI message:', aiMessageError);
    }

    // Update session intent if detected
    if (detectedIntent) {
      await supabaseAdmin
        .from('web_chat_sessions')
        .update({
          intent: detectedIntent,
          urgency: detectedIntent === 'emergency_leak' || detectedIntent === 'high_urgency' ? 'urgent' : 'normal',
        })
        .eq('id', session.id);
    }

    return NextResponse.json({
      response: aiResponse,
      intent: detectedIntent,
      should_collect_info: shouldCollectInfo,
      message_id: aiMessage?.id,
    });
  } catch (error: any) {
    console.error('Error in /api/chat/send:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

























