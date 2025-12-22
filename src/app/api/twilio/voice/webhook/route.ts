import { NextRequest, NextResponse } from 'next/server';
import { twilioService } from '@/lib/twilio-service';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const callSid = formData.get('CallSid') as string;
    const speechResult = formData.get('SpeechResult') as string;

    if (!from || !callSid) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log('Received call:', { from, callSid, speechResult });

    // Handle initial call
    if (!speechResult) {
      const result = await twilioService.handleIncomingCall(from, callSid);
      
      if (!result.success) {
        console.error('Call handling failed:', result.error);
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return new NextResponse(result.twiml, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml',
        },
      });
    }

    // Handle speech input
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">I understand you said: ${speechResult}. Let me help you with that.</Say>
    <Gather input="speech" action="${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/process" method="POST" timeout="10">
        <Say voice="alice">Is there anything else I can help you with?</Say>
    </Gather>
    <Say voice="alice">Thank you for calling. Have a great day!</Say>
    <Hangup/>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error) {
    console.error('Voice webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}