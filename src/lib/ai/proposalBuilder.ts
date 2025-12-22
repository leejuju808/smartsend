// Block 20520 — SmartSend Roofing Proposal Builder v1
// AI-powered proposal text generator (homeowner-friendly language)

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ProposalData {
  homeowner_name: string;
  property_address: string;
  roof_summary: {
    scope: string;
    material: string;
    code_items: string[];
  };
  project_price: number;
  insurance_comparison?: {
    carrier: string;
    rcv_total: number;
    deductible: number;
    depreciation_recoverable: boolean;
    notes: string;
  };
  line_items: Array<{
    description: string;
    category: string;
    quantity: number;
    unit: string;
    total_cost: number;
  }>;
  warranty: string;
  timeline: string;
  next_steps: string;
}

export interface ContractorPreferences {
  company_name: string;
  logo_url?: string;
  default_terms?: string;
  warranty_type?: string;
  payment_expectations?: string;
  message_style?: "formal" | "casual" | "friendly" | "premium";
}

/**
 * Generate homeowner-friendly proposal text from proposal data
 */
export async function generateProposalText(
  proposalData: ProposalData,
  contractorPreferences: ContractorPreferences
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const companyName = contractorPreferences.company_name || "Your Roofing Company";
  const messageStyle = contractorPreferences.message_style || "friendly";

  const systemPrompt = `You are SmartSend Proposal Builder v1 - an AI that writes professional, homeowner-friendly roofing proposals.

CRITICAL RULES:
- Write in clear, simple language (6th-8th grade reading level)
- NO contractor jargon - translate everything to homeowner terms
- Be professional but warm and trustworthy
- Use short paragraphs (2-3 sentences max)
- Make it easy to understand pricing and next steps
- Sound like a real roofing company, not AI
- Keep insurance explanations simple and clear

Message Style: ${messageStyle}
- formal: Professional and polished
- casual: Conversational and relaxed
- friendly: Warm and approachable (default)
- premium: High-end and sophisticated

Structure the proposal with these sections:
1. Header: "Roof Replacement Proposal" with company name
2. Introduction: Thank homeowner, reference inspection/insurance scope
3. Project Summary: Roof size, material, pitch, scope overview
4. Total Project Cost: Clear pricing breakdown
5. Insurance Details: If applicable, explain RCV, deductible, depreciation
6. Warranty: Explain warranty coverage
7. Project Timeline: When materials arrive, installation schedule
8. Next Steps: Clear call-to-action

Return ONLY the proposal text, no markdown formatting.`;

  const userPrompt = `Generate a roofing proposal for:

Homeowner: ${proposalData.homeowner_name}
Property: ${proposalData.property_address}
Company: ${companyName}

Roof Summary:
- ${proposalData.roof_summary.scope}
- Material: ${proposalData.roof_summary.material}
- Code Items: ${proposalData.roof_summary.code_items.join(", ") || "Standard code-compliant installation"}

Project Price: $${proposalData.project_price.toLocaleString()}

${proposalData.insurance_comparison ? `
Insurance Details:
- Carrier: ${proposalData.insurance_comparison.carrier}
- RCV Total: $${proposalData.insurance_comparison.rcv_total.toLocaleString()}
- Deductible: $${proposalData.insurance_comparison.deductible.toLocaleString()}
- Depreciation: ${proposalData.insurance_comparison.depreciation_recoverable ? "Recoverable (you'll receive this after installation)" : "Non-recoverable"}
- Notes: ${proposalData.insurance_comparison.notes}
` : ""}

Warranty: ${proposalData.warranty}

Timeline: ${proposalData.timeline}

Next Steps: ${proposalData.next_steps}

Generate the full proposal text in a ${messageStyle} tone.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    return completion.choices[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("Error generating proposal text:", error);
    throw error;
  }
}

/**
 * Build proposal data structure from estimate, scope, and financials
 */
export function buildProposalData(params: {
  homeownerName: string;
  propertyAddress: string;
  estimate: any;
  roofScope?: any;
  claimFinancials?: any;
  contractorPreferences: ContractorPreferences;
}): ProposalData {
  const { homeownerName, propertyAddress, estimate, roofScope, claimFinancials, contractorPreferences } = params;

  // Build roof summary
  const squares = estimate.roof_squares_avg || estimate.roof_squares_min || 20;
  const material = estimate.material_type === "asphalt" 
    ? `${estimate.shingle_type || "Architectural"} Asphalt Shingle`
    : estimate.material_type || "Architectural Asphalt Shingle";
  
  const pitchDesc = estimate.pitch_category === "steep" ? "Steep" : 
                     estimate.pitch_category === "high" ? "High pitch" : "";
  const storiesDesc = roofScope?.stories === 2 ? "2-story" : "";
  
  const roofSummaryScope = [
    `${squares} squares`,
    material.toLowerCase(),
    pitchDesc,
    storiesDesc
  ].filter(Boolean).join(", ");

  // Extract code items from estimate
  const codeItems: string[] = [];
  if (estimate.insurance_code_items && Array.isArray(estimate.insurance_code_items)) {
    estimate.insurance_code_items.forEach((item: any) => {
      if (item.description) {
        codeItems.push(item.description);
      }
    });
  }
  if (codeItems.length === 0) {
    codeItems.push("Ice & water shield", "Ridge vent", "Drip edge");
  }

  // Build insurance comparison if available
  let insuranceComparison;
  if (claimFinancials && (claimFinancials.rcv_total || claimFinancials.acv_total)) {
    const rcv = claimFinancials.rcv_total || claimFinancials.acv_total || 0;
    const deductible = claimFinancials.deductible || 0;
    const projectPrice = estimate.estimated_total_avg || estimate.estimated_total_min || 0;
    
    let notes = "";
    if (projectPrice < rcv) {
      notes = "Estimate is below RCV. Supplements likely.";
    } else if (projectPrice > rcv) {
      notes = "Estimate exceeds RCV. We'll work with your adjuster on supplements.";
    } else {
      notes = "Estimate aligns with insurance scope.";
    }

    insuranceComparison = {
      carrier: claimFinancials.carrier || "Your Insurance Carrier",
      rcv_total: rcv,
      deductible: deductible,
      depreciation_recoverable: claimFinancials.depreciation_recoverable ?? true,
      notes: notes,
    };
  }

  // Build warranty text
  const warranty = contractorPreferences.warranty_type || 
    estimate.warranty || 
    "10-year workmanship warranty. Manufacturer warranty based on shingle selection.";

  // Build timeline
  const timeline = estimate.estimated_job_duration_days_min && estimate.estimated_job_duration_days_max
    ? `Materials delivered within 1–2 business days. Full installation completed in ${estimate.estimated_job_duration_days_min}-${estimate.estimated_job_duration_days_max} day${estimate.estimated_job_duration_days_max > 1 ? "s" : ""}. Final inspection and cleanup included.`
    : "Materials delivered within 1–2 business days. Full installation completed in 1 day. Final inspection and cleanup included.";

  // Build next steps
  const nextSteps = contractorPreferences.payment_expectations 
    ? `Click the button below to confirm and schedule your installation. ${contractorPreferences.payment_expectations}`
    : "Click the button below to confirm and schedule your installation.";

  // Build line items from estimate
  const lineItems = estimate.estimate_line_items?.map((item: any) => ({
    description: item.description,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    total_cost: item.total_cost,
  })) || [];

  return {
    homeowner_name: homeownerName,
    property_address: propertyAddress,
    roof_summary: {
      scope: roofSummaryScope,
      material: material,
      code_items: codeItems,
    },
    project_price: estimate.estimated_total_avg || estimate.estimated_total_min || 0,
    insurance_comparison: insuranceComparison,
    line_items: lineItems,
    warranty: warranty,
    timeline: timeline,
    next_steps: nextSteps,
  };
}
















































