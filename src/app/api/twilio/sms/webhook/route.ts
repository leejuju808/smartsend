import { NextRequest, NextResponse } from 'next/server';
import { twilioService } from '@/lib/twilio-service';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;
    const messageSid = formData.get('MessageSid') as string;

    if (!from || !body || !messageSid) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log('Received SMS:', { from, body, messageSid });

    const result = await twilioService.handleIncomingSMS(from, body, messageSid);

    if (!result.success) {
      console.error('SMS handling failed:', result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Return TwiML response for Twilio
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${result.response}</Message>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error) {
    console.error('SMS webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}