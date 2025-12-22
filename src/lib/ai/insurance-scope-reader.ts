// Block 256600 — SmartSend Insurance Supplement Engine v1
// AI Insurance Scope Reader
// Extracts structured data from insurance scope PDFs

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ScopeLineItem {
  code: string; // Xactimate code or custom code
  description: string;
  quantity: number;
  unit: string; // "SQ", "LF", "EA", "ROLL", etc.
  unitPrice: number;
  totalPrice: number;
  wasteFactor?: number;
  o_p?: number; // Overhead & Profit percentage
  depreciation?: number;
  acv?: number; // Actual Cash Value
  rcv?: number; // Replacement Cost Value
}

export interface ParsedInsuranceScope {
  carrier: string;
  claimNumber?: string;
  policyNumber?: string;
  adjusterName?: string;
  adjusterEmail?: string;
  adjusterPhone?: string;
  scopeDate?: string;
  totalPaid: number;
  totalACV?: number;
  totalRCV?: number;
  depreciation?: number;
  deductible?: number;
  o_p?: number;
  roofSquares?: number;
  roofPitch?: number;
  roofType?: string;
  region?: string;
  lineItems: ScopeLineItem[];
  metadata: Record<string, any>;
}

/**
 * Extract text from PDF buffer
 * Note: Requires pdf-parse library
 */
async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    // Try to use pdf-parse if available
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(pdfBuffer);
    return data.text || '';
  } catch (error) {
    console.warn('pdf-parse not available, using fallback');
    // Fallback: return empty string (will need PDF text extraction service)
    return '';
  }
}

/**
 * Parse insurance scope PDF and extract structured data
 */
export async function parseInsuranceScopePDF(
  pdfUrl: string,
  pdfBuffer?: Buffer
): Promise<ParsedInsuranceScope> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // Extract text from PDF
  let pdfText = '';
  if (pdfBuffer) {
    pdfText = await extractTextFromPDF(pdfBuffer);
  } else if (pdfUrl) {
    // Fetch PDF and extract text
    try {
      const response = await fetch(pdfUrl);
      const arrayBuffer = await response.arrayBuffer();
      pdfText = await extractTextFromPDF(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error('Error fetching PDF:', error);
      throw new Error('Failed to fetch PDF');
    }
  }

  if (!pdfText || pdfText.trim().length < 100) {
    throw new Error('PDF text extraction failed or PDF is empty');
  }

  const systemPrompt = `You are SmartSend AI Insurance Scope Reader v1 - an expert at extracting structured data from insurance scope documents.

Extract ALL information from this insurance scope PDF and return it as structured JSON.

CRITICAL: Extract EVERY line item with:
- Code (Xactimate code or custom code)
- Description (full line item name)
- Quantity (numeric value)
- Unit ("SQ" for squares, "LF" for linear feet, "EA" for each, "ROLL" for rolls, etc.)
- Unit Price (price per unit)
- Total Price (quantity × unit price)
- Waste Factor (if mentioned)
- O&P (Overhead & Profit percentage, if mentioned)
- Depreciation (if mentioned)
- ACV (Actual Cash Value, if mentioned)
- RCV (Replacement Cost Value, if mentioned)

Also extract:
- Carrier name (State Farm, Allstate, etc.)
- Claim number
- Policy number
- Adjuster name, email, phone
- Scope date
- Total paid amount
- Total ACV, RCV, depreciation, deductible
- Roof squares
- Roof pitch (e.g., 6.0 for 6/12 pitch)
- Roof type (shingles, tile, metal, etc.)
- Region/state (for Xactimate pricing)

Return ONLY valid JSON in this exact format:
{
  "carrier": "State Farm",
  "claimNumber": "CL-2024-001",
  "policyNumber": "AGX-9210",
  "adjusterName": "John Smith",
  "adjusterEmail": "john.smith@statefarm.com",
  "adjusterPhone": "555-1234",
  "scopeDate": "2024-01-15",
  "totalPaid": 12880.00,
  "totalACV": 9680.00,
  "totalRCV": 14800.00,
  "depreciation": 5200.00,
  "deductible": 1000.00,
  "o_p": 10.0,
  "roofSquares": 28.47,
  "roofPitch": 6.0,
  "roofType": "shingles",
  "region": "TX",
  "lineItems": [
    {
      "code": "RFG220",
      "description": "Remove Laminated Shingles",
      "quantity": 28.47,
      "unit": "SQ",
      "unitPrice": 72.14,
      "totalPrice": 2053.83,
      "wasteFactor": 10.0,
      "o_p": 10.0,
      "depreciation": 820.00,
      "acv": 1233.83,
      "rcv": 2053.83
    }
  ],
  "metadata": {}
}

Be thorough and extract EVERY line item. Do not skip any items.`;

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
          content: `Extract all data from this insurance scope PDF:\n\n${pdfText.substring(0, 50000)}`, // Limit to 50k chars
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const parsed = JSON.parse(content) as ParsedInsuranceScope;

    // Validate and set defaults
    if (!parsed.carrier) {
      parsed.carrier = 'Unknown Carrier';
    }
    if (!parsed.lineItems) {
      parsed.lineItems = [];
    }
    if (parsed.totalPaid === undefined) {
      parsed.totalPaid = 0;
    }

    // Calculate totals if not provided
    if (parsed.totalPaid === 0 && parsed.lineItems.length > 0) {
      parsed.totalPaid = parsed.lineItems.reduce(
        (sum, item) => sum + (item.totalPrice || 0),
        0
      );
    }

    return parsed;
  } catch (error: any) {
    console.error('Error parsing insurance scope:', error);
    throw new Error(`Failed to parse insurance scope: ${error.message}`);
  }
}

/**
 * Parse insurance scope from text (alternative method)
 */
export async function parseInsuranceScopeFromText(
  text: string
): Promise<ParsedInsuranceScope> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are SmartSend AI Insurance Scope Reader v1. Extract structured data from insurance scope text.

Return ONLY valid JSON matching the ParsedInsuranceScope format with all line items extracted.`;

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
          content: `Extract all data from this insurance scope text:\n\n${text.substring(0, 50000)}`,
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    return JSON.parse(content) as ParsedInsuranceScope;
  } catch (error: any) {
    console.error('Error parsing insurance scope from text:', error);
    throw new Error(`Failed to parse insurance scope: ${error.message}`);
  }
}





















