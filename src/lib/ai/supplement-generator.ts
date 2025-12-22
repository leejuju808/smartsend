// Block 256600 — SmartSend Insurance Supplement Engine v1
// Auto-Generated Supplement Request Generator
// Creates professional supplement letters with line items

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface SupplementRequestData {
  carrier: string;
  claimNumber: string;
  adjusterName?: string;
  adjusterEmail?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    reason: string;
    codeReference?: string;
  }>;
  totalRequested: number;
  evidencePhotos?: string[];
}

export interface GeneratedSupplementLetter {
  letterText: string;
  letterHtml: string;
  subject: string;
  summary: string;
}

/**
 * Generate professional supplement request letter
 */
export async function generateSupplementLetter(
  data: SupplementRequestData
): Promise<GeneratedSupplementLetter> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are SmartSend AI Supplement Letter Generator v1 - an expert at writing professional, persuasive supplement requests to insurance adjusters.

Generate a professional supplement request letter that:
1. Is respectful and professional (not confrontational)
2. Clearly explains why each item is needed
3. References building codes when applicable
4. Provides specific quantities and pricing
5. Requests approval in a firm but courteous manner
6. Includes a summary table of all items

Format:
- Professional business letter format
- Clear subject line
- Introduction explaining the supplement request
- Detailed line items with explanations
- Summary table
- Professional closing

Return ONLY valid JSON:
{
  "letterText": "Full letter text (plain text)",
  "letterHtml": "Full letter HTML (formatted)",
  "subject": "Subject line for email",
  "summary": "Brief summary of supplement request"
}`;

  const lineItemsText = data.lineItems.map((item, i) => 
    `${i + 1}. ${item.description} - ${item.quantity} ${item.unit} @ $${item.unitPrice.toFixed(2)} = $${item.totalPrice.toFixed(2)}\n   Reason: ${item.reason}${item.codeReference ? ` (Code: ${item.codeReference})` : ''}`
  ).join('\n\n');

  const prompt = `Generate a supplement request letter for:

Carrier: ${data.carrier}
Claim Number: ${data.claimNumber}
Adjuster: ${data.adjusterName || 'Adjuster'}

Line Items Requested:
${lineItemsText}

Total Requested: $${data.totalRequested.toFixed(2)}

${data.evidencePhotos && data.evidencePhotos.length > 0 
  ? `Evidence: ${data.evidencePhotos.length} supporting photos attached.`
  : ''}

Make it professional, clear, and persuasive. Return ONLY valid JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 2000,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const result = JSON.parse(content) as GeneratedSupplementLetter;

    // Validate
    if (!result.letterText) {
      throw new Error('Letter text not generated');
    }
    if (!result.subject) {
      result.subject = `Supplement Request - Claim ${data.claimNumber}`;
    }
    if (!result.summary) {
      result.summary = `Supplement request for ${data.lineItems.length} items totaling $${data.totalRequested.toFixed(2)}.`;
    }

    return result;
  } catch (error: any) {
    console.error('Error generating supplement letter:', error);
    throw new Error(`Failed to generate supplement letter: ${error.message}`);
  }
}

/**
 * Generate supplement letter HTML template (for PDF generation)
 */
export function generateSupplementLetterHTML(
  letter: GeneratedSupplementLetter,
  data: SupplementRequestData
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 1in;
    }
    .header {
      margin-bottom: 30px;
    }
    .date {
      text-align: right;
      margin-bottom: 20px;
    }
    .recipient {
      margin-bottom: 20px;
    }
    .subject {
      font-weight: bold;
      margin-bottom: 20px;
    }
    .body {
      margin-bottom: 30px;
    }
    .line-items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .line-items-table th,
    .line-items-table td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    .line-items-table th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    .total {
      text-align: right;
      font-weight: bold;
      font-size: 14pt;
      margin-top: 20px;
    }
    .signature {
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="date">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    <div class="recipient">
      ${data.adjusterName ? `<strong>${data.adjusterName}</strong><br>` : ''}
      ${data.carrier}<br>
      ${data.claimNumber ? `Claim #: ${data.claimNumber}` : ''}
    </div>
  </div>

  <div class="subject">
    Re: Supplement Request for Claim ${data.claimNumber}
  </div>

  <div class="body">
    ${letter.letterHtml || letter.letterText.replace(/\n/g, '<br>')}
  </div>

  <table class="line-items-table">
    <thead>
      <tr>
        <th>Item</th>
        <th>Description</th>
        <th>Quantity</th>
        <th>Unit Price</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${data.lineItems.map((item, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.description}</td>
          <td>${item.quantity} ${item.unit}</td>
          <td>$${item.unitPrice.toFixed(2)}</td>
          <td>$${item.totalPrice.toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="total">
    Total Supplement Requested: $${data.totalRequested.toFixed(2)}
  </div>

  <div class="signature">
    <p>Thank you for your consideration.</p>
    <p>Sincerely,<br><br><br>_________________________</p>
  </div>
</body>
</html>
  `.trim();
}





















