/**
 * Block 20560 — SmartSend Proposal Email Generator
 * 
 * Generates personalized, homeowner-friendly proposal emails with:
 * - AI-chosen subject line
 * - Personalized opener
 * - Proposal body text
 * - Contractor signature
 * - Insurance-aware messaging
 * - Local references
 * - Weather mentions
 * - Clear next steps
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ProposalEmailInput {
  proposalData: {
    homeowner_name: string;
    property_address: string;
    project_price: number;
    scope_of_work?: string[];
    warranty?: string;
    timeline?: string;
    next_steps?: string;
  };
  insuranceData: {
    carrier: string | null;
    deductible: number | null;
    rcv_total: string | null;
    acv_total: string | null;
    depreciation_recoverable: boolean | null;
    depreciation_amount: number | null;
  };
  contractorInfo: {
    company_name: string;
    phone: string | null;
    email: string | null;
    signature: string;
  };
  contactEmail: string;
  contactName: string;
  city?: string;
  state?: string;
}

export interface ProposalEmailOutput {
  subject: string;
  htmlBody: string;
  textBody: string;
}

/**
 * Generate personalized proposal email
 */
export async function generateProposalEmail(
  input: ProposalEmailInput
): Promise<ProposalEmailOutput> {
  const {
    proposalData,
    insuranceData,
    contractorInfo,
    contactName,
    city,
    state,
  } = input;

  const systemPrompt = `You are SmartSend AI, writing a professional, homeowner-friendly proposal email for a roofing contractor.

Your goal: Write an email that feels personal, knowledgeable, trustworthy, and makes the homeowner want to move forward.

Key Requirements:
1. Subject Line: Choose the BEST subject from these options (pick one):
   - "Your Roof Replacement Proposal ([CARRIER] Approved)"
   - "Your Full Roof Estimate is Ready"
   - "Next Steps for Your Roof Replacement"
   - "Proposal Attached – Let's Get You Scheduled"
   
   Choose based on: If insurance carrier is known, use first option. If no insurance, use second. If urgent/hot lead, use fourth.

2. Email Body Structure:
   - Personalized greeting using homeowner's first name
   - Thank them for reaching out
   - Reference their insurance situation (if applicable)
   - Present the proposal clearly with:
     * Total Project Price: $X,XXX
     * Insurance RCV (if applicable): $X,XXX
     * Deductible: $X,XXX
     * Recoverable Depreciation (if applicable): Yes/No
   - Scope of work (bullet points)
   - Warranty information
   - Timeline (materials delivery, installation duration)
   - Clear next steps
   - Professional signature with company name, phone, email

3. Tone & Style:
   - Professional but friendly
   - Knowledgeable about insurance (if applicable)
   - Confident but not pushy
   - Clear and concise
   - Use local references if city/state provided
   - Mention weather if relevant (e.g., "before the next storm season")

4. Insurance-Specific Messaging:
   - If RCV approved: "Based on your [CARRIER] approved claim..."
   - If recoverable depreciation: "Since your approval includes recoverable depreciation, we'll help you recover that final check once the install is finished."
   - If deductible mentioned: Reference it clearly

5. Personalization:
   - Use homeowner's first name
   - Reference their property address
   - Match their communication style (if previous emails available)
   - Add local context (city, weather patterns)

Return JSON ONLY with this structure:
{
  "subject": "chosen subject line",
  "htmlBody": "full HTML email body (use proper HTML tags, line breaks, etc.)",
  "textBody": "plain text version (no HTML)"
}`;

  const userPrompt = `Generate a proposal email with these details:

HOMEOWNER:
- Name: ${contactName}
- Property: ${proposalData.property_address}
${city ? `- City: ${city}` : ''}
${state ? `- State: ${state}` : ''}

PROPOSAL:
- Total Price: $${proposalData.project_price.toLocaleString()}
- Scope: ${proposalData.scope_of_work?.join(', ') || 'Full roof replacement'}
- Warranty: ${proposalData.warranty || '10-year workmanship warranty'}
- Timeline: ${proposalData.timeline || 'Materials within 1-2 business days, installation in one day'}

INSURANCE:
${insuranceData.carrier ? `- Carrier: ${insuranceData.carrier}` : '- No insurance information'}
${insuranceData.rcv_total ? `- RCV Total: $${insuranceData.rcv_total}` : ''}
${insuranceData.acv_total ? `- ACV Total: $${insuranceData.acv_total}` : ''}
${insuranceData.deductible ? `- Deductible: $${insuranceData.deductible.toLocaleString()}` : ''}
${insuranceData.depreciation_recoverable !== null ? `- Recoverable Depreciation: ${insuranceData.depreciation_recoverable ? 'Yes' : 'No'}` : ''}
${insuranceData.depreciation_amount ? `- Depreciation Amount: $${insuranceData.depreciation_amount.toLocaleString()}` : ''}

CONTRACTOR:
- Company: ${contractorInfo.company_name}
- Phone: ${contractorInfo.phone || 'Not provided'}
- Email: ${contractorInfo.email || 'Not provided'}
${contractorInfo.signature ? `- Signature: ${contractorInfo.signature}` : ''}

Generate the email now.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content returned from OpenAI');
    }

    const parsed = JSON.parse(content) as ProposalEmailOutput;

    // Validate required fields
    if (!parsed.subject || !parsed.htmlBody || !parsed.textBody) {
      throw new Error('Invalid response format from OpenAI');
    }

    return parsed;
  } catch (error) {
    console.error('[Proposal Email Generator] Error:', error);
    
    // Fallback to basic email if AI fails
    return generateFallbackEmail(input);
  }
}

/**
 * Generate fallback email if AI fails
 */
function generateFallbackEmail(input: ProposalEmailInput): ProposalEmailOutput {
  const {
    proposalData,
    insuranceData,
    contractorInfo,
    contactName,
  } = input;

  const firstName = contactName.split(' ')[0];
  
  const subject = insuranceData.carrier
    ? `Your Roof Replacement Proposal (${insuranceData.carrier} Approved)`
    : 'Your Full Roof Estimate is Ready';

  const htmlBody = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <p>Hi ${firstName},</p>
        
        <p>Thanks again for reaching out about your roof. Based on ${insuranceData.carrier ? `your ${insuranceData.carrier} approved claim` : 'the roof measurements'}, I've put together your full replacement proposal below.</p>
        
        <h3>Project Summary</h3>
        <ul>
          <li><strong>Total Project Price:</strong> $${proposalData.project_price.toLocaleString()}</li>
          ${insuranceData.rcv_total ? `<li><strong>Insurance RCV:</strong> $${insuranceData.rcv_total}</li>` : ''}
          ${insuranceData.deductible ? `<li><strong>Deductible:</strong> $${insuranceData.deductible.toLocaleString()}</li>` : ''}
          ${insuranceData.depreciation_recoverable !== null ? `<li><strong>Recoverable Depreciation:</strong> ${insuranceData.depreciation_recoverable ? 'Yes' : 'No'}</li>` : ''}
        </ul>
        
        <h3>Scope of Work</h3>
        <ul>
          ${proposalData.scope_of_work?.map(item => `<li>${item}</li>`).join('') || '<li>Remove old roofing</li><li>Install new underlayment</li><li>Install architectural shingles</li><li>Ridge vent installation</li><li>Ice & water shield</li><li>All code-required components</li>'}
        </ul>
        
        <p>The proposal includes materials, labor, cleanup, disposal, and a ${proposalData.warranty || '10-year workmanship warranty'}.</p>
        
        <p>We can deliver materials within 1–2 business days and complete the full installation in one day.</p>
        
        ${insuranceData.depreciation_recoverable ? '<p>Since your approval includes recoverable depreciation, we\'ll help you recover that final check once the install is finished.</p>' : ''}
        
        <p>If everything looks good, you can reply to this email or give us a quick call to get your installation scheduled.</p>
        
        <p>Looking forward to helping you get everything completed.</p>
        
        <p>
          — ${contractorInfo.company_name}<br>
          ${contractorInfo.phone ? `${contractorInfo.phone}<br>` : ''}
          ${contractorInfo.email || ''}
        </p>
      </body>
    </html>
  `;

  const textBody = `
Hi ${firstName},

Thanks again for reaching out about your roof. Based on ${insuranceData.carrier ? `your ${insuranceData.carrier} approved claim` : 'the roof measurements'}, I've put together your full replacement proposal below.

Project Summary:
- Total Project Price: $${proposalData.project_price.toLocaleString()}
${insuranceData.rcv_total ? `- Insurance RCV: $${insuranceData.rcv_total}\n` : ''}${insuranceData.deductible ? `- Deductible: $${insuranceData.deductible.toLocaleString()}\n` : ''}${insuranceData.depreciation_recoverable !== null ? `- Recoverable Depreciation: ${insuranceData.depreciation_recoverable ? 'Yes' : 'No'}\n` : ''}

Scope of Work:
${proposalData.scope_of_work?.map(item => `• ${item}`).join('\n') || '• Remove old roofing\n• Install new underlayment\n• Install architectural shingles\n• Ridge vent installation\n• Ice & water shield\n• All code-required components'}

The proposal includes materials, labor, cleanup, disposal, and a ${proposalData.warranty || '10-year workmanship warranty'}.

We can deliver materials within 1–2 business days and complete the full installation in one day.

${insuranceData.depreciation_recoverable ? 'Since your approval includes recoverable depreciation, we\'ll help you recover that final check once the install is finished.\n\n' : ''}If everything looks good, you can reply to this email or give us a quick call to get your installation scheduled.

Looking forward to helping you get everything completed.

— ${contractorInfo.company_name}
${contractorInfo.phone ? `${contractorInfo.phone}\n` : ''}${contractorInfo.email || ''}
  `.trim();

  return {
    subject,
    htmlBody,
    textBody,
  };
}
















































