// Email Notification Integration
// Sends hot lead alerts via email

import type { HandoffPayload, HandoffResult } from './types';

export async function emailSalesTeam(payload: HandoffPayload): Promise<HandoffResult> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY') || process.env.RESEND_API_KEY;
  const salesEmail = Deno.env.get('SALES_TEAM_EMAIL') || process.env.SALES_TEAM_EMAIL || 'sales@company.com';
  
  if (!resendApiKey) {
    return {
      status: 'failed',
      message: 'RESEND_API_KEY not configured'
    };
  }

  try {
    const emailHtml = generateEmailHtml(payload);
    const emailText = generateEmailText(payload);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SmartSend <alerts@smartsend.ai>',
        to: salesEmail,
        subject: `🔥 Hot Lead — ${payload.lead_name}`,
        html: emailHtml,
        text: emailText
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        status: 'failed',
        message: `Resend API error: ${errorData.message || response.statusText}`,
        data: errorData
      };
    }

    const data = await response.json();

    return {
      status: 'success',
      message: 'Email notification sent successfully',
      data: { email_id: data.id }
    };
  } catch (error: any) {
    return {
      status: 'failed',
      message: error?.message || 'Failed to send email notification',
      data: { error: String(error) }
    };
  }
}

function generateEmailHtml(payload: HandoffPayload): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ff6b6b; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
        .field { margin: 10px 0; }
        .label { font-weight: bold; color: #555; }
        .value { margin-top: 5px; }
        .score { font-size: 24px; font-weight: bold; color: #ff6b6b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔥 Hot Lead Alert</h1>
        </div>
        <div class="content">
          <div class="field">
            <div class="label">Lead:</div>
            <div class="value">${escapeHtml(payload.lead_name)}</div>
          </div>
          <div class="field">
            <div class="label">Email:</div>
            <div class="value">${escapeHtml(payload.lead_email || 'N/A')}</div>
          </div>
          ${payload.company ? `
          <div class="field">
            <div class="label">Company:</div>
            <div class="value">${escapeHtml(payload.company)}</div>
          </div>
          ` : ''}
          <div class="field">
            <div class="label">Opportunity Score:</div>
            <div class="value score">${payload.opportunity || 0}/10</div>
          </div>
          ${payload.tone ? `
          <div class="field">
            <div class="label">Tone:</div>
            <div class="value">${escapeHtml(payload.tone)}</div>
          </div>
          ` : ''}
          ${payload.buyer_role ? `
          <div class="field">
            <div class="label">Buyer Role:</div>
            <div class="value">${escapeHtml(payload.buyer_role)}</div>
          </div>
          ` : ''}
          ${payload.summary ? `
          <div class="field">
            <div class="label">Summary:</div>
            <div class="value">${escapeHtml(payload.summary)}</div>
          </div>
          ` : ''}
          ${payload.objections && payload.objections.length > 0 ? `
          <div class="field">
            <div class="label">Objections:</div>
            <div class="value">
              <ul>
                ${payload.objections.map((o: any) => `<li>${escapeHtml(typeof o === 'string' ? o : JSON.stringify(o))}</li>`).join('')}
              </ul>
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateEmailText(payload: HandoffPayload): string {
  const parts: string[] = [];
  parts.push('🔥 HOT LEAD ALERT');
  parts.push('');
  parts.push(`Lead: ${payload.lead_name}`);
  parts.push(`Email: ${payload.lead_email || 'N/A'}`);
  if (payload.company) {
    parts.push(`Company: ${payload.company}`);
  }
  parts.push(`Opportunity Score: ${payload.opportunity || 0}/10`);
  if (payload.tone) {
    parts.push(`Tone: ${payload.tone}`);
  }
  if (payload.buyer_role) {
    parts.push(`Buyer Role: ${payload.buyer_role}`);
  }
  if (payload.summary) {
    parts.push('');
    parts.push(`Summary: ${payload.summary}`);
  }
  if (payload.objections && payload.objections.length > 0) {
    parts.push('');
    parts.push('Objections:');
    payload.objections.forEach((o: any) => {
      parts.push(`  • ${typeof o === 'string' ? o : JSON.stringify(o)}`);
    });
  }
  return parts.join('\n');
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}












