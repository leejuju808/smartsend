import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/src/server/supabase';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'edge';

interface StartChatRequest {
  company_id?: string;
  workspace_id?: string;
  visitor_ip?: string;
  visitor_user_agent?: string;
  referrer_url?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: StartChatRequest = await req.json();
    
    // Get company_id from query param or body
    const companyId = req.nextUrl.searchParams.get('company_id') || body.company_id;
    const workspaceId = body.workspace_id;
    
    if (!companyId && !workspaceId) {
      return NextResponse.json(
        { error: 'company_id or workspace_id is required' },
        { status: 400 }
      );
    }

    // If company_id provided, get workspace_id from company
    let finalWorkspaceId = workspaceId;
    if (companyId && !workspaceId) {
      const { data: company } = await supabaseAdmin
        .from('roofing_companies')
        .select('workspace_id')
        .eq('id', companyId)
        .single();
      
      if (!company) {
        return NextResponse.json(
          { error: 'Company not found' },
          { status: 404 }
        );
      }
      finalWorkspaceId = company.workspace_id;
    }

    if (!finalWorkspaceId) {
      return NextResponse.json(
        { error: 'Could not determine workspace_id' },
        { status: 400 }
      );
    }

    // Generate session token
    const { data: tokenData } = await supabaseAdmin.rpc('generate_chat_session_token');
    const sessionToken = tokenData || `chat_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    // Get visitor info from request
    const visitorIp = body.visitor_ip || req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const visitorUserAgent = body.visitor_user_agent || req.headers.get('user-agent') || 'unknown';
    const referrerUrl = body.referrer_url || req.headers.get('referer') || null;

    // Create chat session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('web_chat_sessions')
      .insert({
        workspace_id: finalWorkspaceId,
        company_id: companyId || null,
        session_token: sessionToken,
        visitor_ip: visitorIp,
        visitor_user_agent: visitorUserAgent,
        referrer_url: referrerUrl,
        status: 'open',
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Error creating chat session:', sessionError);
      return NextResponse.json(
        { error: 'Failed to create chat session' },
        { status: 500 }
      );
    }

    // Get company info for welcome message
    let companyName = 'SmartSend Roofing';
    let welcomeMessage = "Hi! I'm your SmartSend AI assistant. I'm here 24/7 to help with any roofing questions. How can I help you today?";
    
    if (companyId) {
      const { data: company } = await supabaseAdmin
        .from('roofing_companies')
        .select('name, brand_color_primary')
        .eq('id', companyId)
        .single();
      
      if (company) {
        companyName = company.name || companyName;
        welcomeMessage = `Hi! I'm ${companyName}'s AI assistant. I'm here 24/7 to help with any roofing questions. How can I help you today?`;
      }
    }

    // Create welcome message
    const { error: messageError } = await supabaseAdmin
      .from('web_chat_messages')
      .insert({
        session_id: session.id,
        sender: 'ai',
        message: welcomeMessage,
      });

    if (messageError) {
      console.error('Error creating welcome message:', messageError);
      // Continue anyway, session is created
    }

    return NextResponse.json({
      session_id: session.id,
      session_token: sessionToken,
      welcome_message: welcomeMessage,
      company_name: companyName,
    });
  } catch (error: any) {
    console.error('Error in /api/chat/start:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

























