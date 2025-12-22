// Block 25940 — SmartSend Roofing Proposal Builder v1
// Enhanced proposal builder with Good/Better/Best pricing, visual elements, and psychology

import OpenAI from "openai";
import type { ProposalData, ContractorPreferences } from "./proposalBuilder";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface PricingTier {
  name: string;
  price: number;
  description: string;
  features: string[];
  selected?: boolean;
  is_popular?: boolean;
}

export interface PricingTierModel {
  good: PricingTier;
  better: PricingTier;
  best: PricingTier;
}

export interface VisualElements {
  before_after_photos?: Array<{ url: string; caption: string }>;
  problem_areas?: Array<{ url: string; description: string; severity: string }>;
  solution_diagrams?: Array<{ type: string; url: string; description: string }>;
  shingle_color_swatches?: Array<{ color: string; image_url: string; brand: string }>;
  product_visuals?: Array<{ product: string; image_url: string; brand: string }>;
  brand_logos?: string[];
  warranty_badges?: Array<{ type: string; years: number; image_url?: string }>;
}

export interface InspectionSections {
  inspection_summary: string;
  what_we_found: Array<{ photo_url?: string; description: string; severity?: string }>;
  recommended_repairs: string;
  why_fix_now: string;
  whats_included: string[];
  whats_not_included: string[];
  installation_process: string;
}

export interface InsuranceMode {
  is_insurance_claim: boolean;
  deductible_explanation?: string;
  acv_vs_rcv?: {
    acv: number;
    rcv: number;
    explanation: string;
  };
  depreciation_logic?: string;
  upgrade_opportunities?: string[];
  supplement_explanation?: string;
  color_choices?: string[];
  required_code_items?: string[];
  timeline_expectations?: string;
}

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  selected?: boolean;
  image_url?: string;
}

export interface WarrantyDetails {
  workmanship_warranty?: {
    years: number;
    description: string;
    coverage: string[];
  };
  manufacturer_warranty?: {
    years: number;
    description: string;
    coverage: string[];
  };
  extended_warranty_options?: Array<{
    name: string;
    years: number;
    price: number;
  }>;
}

export interface ProposalV1Data extends ProposalData {
  pricing_tier_model?: PricingTierModel;
  visual_elements?: VisualElements;
  inspection_sections?: InspectionSections;
  insurance_mode?: InsuranceMode;
  upgrade_options?: UpgradeOption[];
  warranty_details?: WarrantyDetails;
}

/**
 * Generate Good/Better/Best pricing tiers from base estimate
 */
export function generatePricingTiers(basePrice: number, estimate: any): PricingTierModel {
  // Calculate tier prices (industry standard: Good = -20%, Better = base, Best = +25%)
  const goodPrice = Math.round(basePrice * 0.8);
  const betterPrice = basePrice;
  const bestPrice = Math.round(basePrice * 1.25);

  // Extract material info
  const materialType = estimate.material_type || "asphalt";
  const shingleType = estimate.shingle_type || "architectural";
  const squares = estimate.roof_squares_avg || estimate.roof_squares_min || 20;

  // GOOD (Economy Option)
  const goodTier: PricingTier = {
    name: "Economy Option",
    price: goodPrice,
    description: "Basic shingles, standard underlayment, basic workmanship warranty",
    features: [
      "3-tab shingles",
      "Standard underlayment",
      "Basic workmanship warranty (5 years)",
      "Standard ventilation",
      "Drip edge included",
    ],
    selected: false,
  };

  // BETTER (Most Popular Option)
  const betterTier: PricingTier = {
    name: "Most Popular",
    price: betterPrice,
    description: "Architectural shingles, synthetic underlayment, upgraded ventilation",
    features: [
      `${shingleType === "architectural" ? "Architectural" : "Premium"} shingles`,
      "Synthetic underlayment",
      "Ridge vent upgrade",
      "Extended workmanship warranty (10 years)",
      "Ice & water shield in valleys",
      "Drip edge & starter strip",
    ],
    selected: true,
    is_popular: true,
  };

  // BEST (Premium Option)
  const bestTier: PricingTier = {
    name: "Premium Option",
    price: bestPrice,
    description: "Impact-resistant shingles, full ice & water, maximum warranty",
    features: [
      "Impact-resistant shingles (Class 4)",
      "Full ice & water shield coverage",
      "Ridge vent upgrade",
      "Maximum warranty (15+ years workmanship)",
      "Premium ventilation system",
      "Financing options available",
      "Color upgrade suggestions included",
    ],
    selected: false,
  };

  return {
    good: goodTier,
    better: betterTier,
    best: bestTier,
  };
}

/**
 * Generate upgrade options based on estimate and roof scope
 */
export function generateUpgradeOptions(estimate: any, roofScope?: any): UpgradeOption[] {
  const upgrades: UpgradeOption[] = [];
  const squares = estimate.roof_squares_avg || estimate.roof_squares_min || 20;

  // Ridge vent upgrade
  upgrades.push({
    id: "ridge_vent_upgrade",
    name: "Ridge Vent Upgrade",
    description: "Improved attic ventilation reduces energy costs and extends roof life",
    price: Math.round(squares * 22.5), // ~$22.50 per square
    category: "ventilation",
    selected: false,
  });

  // Underlayment upgrade
  upgrades.push({
    id: "underlayment_upgrade",
    name: "Synthetic Underlayment Upgrade",
    description: "Better protection against water intrusion and wind-driven rain",
    price: Math.round(squares * 34), // ~$34 per square
    category: "materials",
    selected: false,
  });

  // Shingle upgrade (if not already premium)
  if (estimate.shingle_type !== "impact_resistant") {
    upgrades.push({
      id: "shingle_upgrade",
      name: "Impact-Resistant Shingle Upgrade",
      description: "Class 4 impact resistance protects against hail and debris",
      price: Math.round(squares * 85), // ~$85 per square premium
      category: "shingle_upgrade",
      selected: false,
    });
  }

  // Gutter replacement
  upgrades.push({
    id: "gutter_replacement",
    name: "Gutter Replacement",
    description: "New seamless gutters with leaf guards",
    price: 1200, // Base price
    category: "gutter_replacement",
    selected: false,
  });

  // Soffit & Fascia
  upgrades.push({
    id: "soffit_fascia",
    name: "Soffit & Fascia Replacement",
    description: "Replace worn soffit and fascia boards",
    price: 1800, // Base price
    category: "soffit_fascia",
    selected: false,
  });

  // Skylight replacement (if detected)
  if (roofScope?.skylights_detected) {
    upgrades.push({
      id: "skylight_replacement",
      name: "Skylight Replacement",
      description: "Replace old or leaking skylights",
      price: 850, // Per skylight
      category: "skylight_replacement",
      selected: false,
    });
  }

  return upgrades;
}

/**
 * Generate warranty details
 */
export function generateWarrantyDetails(
  contractorPreferences: ContractorPreferences,
  selectedTier?: "good" | "better" | "best"
): WarrantyDetails {
  const tier = selectedTier || "better";

  const warrantyDetails: WarrantyDetails = {
    workmanship_warranty: {
      years: tier === "good" ? 5 : tier === "better" ? 10 : 15,
      description:
        tier === "good"
          ? "5-year workmanship warranty covering installation defects"
          : tier === "better"
            ? "10-year workmanship warranty covering installation defects and material failures"
            : "15-year comprehensive workmanship warranty covering all installation and material issues",
      coverage: [
        "Installation defects",
        "Material failures",
        "Leak repairs",
        "Shingle replacement due to installation error",
      ],
    },
    manufacturer_warranty: {
      years: tier === "good" ? 20 : tier === "better" ? 30 : 50,
      description: `${tier === "good" ? "20" : tier === "better" ? "30" : "50"}-year manufacturer warranty on shingles`,
      coverage: [
        "Material defects",
        "Color fading protection",
        "Wind resistance",
        "Algae resistance",
      ],
    },
  };

  if (tier === "best") {
    warrantyDetails.extended_warranty_options = [
      {
        name: "Extended Workmanship Warranty",
        years: 20,
        price: 500,
      },
    ];
  }

  return warrantyDetails;
}

/**
 * Generate inspection-driven sections
 */
export async function generateInspectionSections(
  estimate: any,
  roofScope?: any,
  photos?: Array<{ url: string; description?: string; severity?: string }>
): Promise<InspectionSections> {
  const squares = estimate.roof_squares_avg || estimate.roof_squares_min || 20;
  const material = estimate.material_type || "asphalt";
  const complexity = estimate.complexity_rating || "medium";

  // Build what we found from photos or estimate
  const whatWeFound = photos?.map((photo) => ({
    photo_url: photo.url,
    description: photo.description || "Roof damage detected",
    severity: photo.severity || "moderate",
  })) || [
    {
      description: `${squares} square roof requiring replacement`,
      severity: "moderate",
    },
  ];

  // Generate inspection summary using AI
  const inspectionSummary = await generateInspectionSummary(estimate, roofScope);

  return {
    inspection_summary: inspectionSummary,
    what_we_found: whatWeFound,
    recommended_repairs: `Full roof replacement recommended. ${squares} squares of ${material} shingles with standard code-compliant installation.`,
    why_fix_now: "Delaying roof replacement can lead to water damage, increased energy costs, and potential structural issues. Addressing this now protects your home and prevents costly repairs.",
    whats_included: [
      "Complete tear-off of existing roof",
      "New shingles and underlayment",
      "Drip edge installation",
      "Ridge vent installation",
      "Cleanup and debris removal",
      "Final inspection",
    ],
    whats_not_included: [
      "Interior repairs (if needed)",
      "Gutter replacement (available as upgrade)",
      "Soffit/fascia replacement (available as upgrade)",
      "Skylight replacement (available as upgrade)",
    ],
    installation_process:
      "Our certified crew will arrive on schedule, complete tear-off, install new materials, and perform thorough cleanup. You'll receive progress updates throughout the process.",
  };
}

/**
 * Generate inspection summary using AI
 */
async function generateInspectionSummary(estimate: any, roofScope?: any): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return "Roof inspection completed. Replacement recommended.";
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a roofing inspector writing a clear, homeowner-friendly inspection summary. Keep it concise (2-3 sentences).",
        },
        {
          role: "user",
          content: `Write an inspection summary for a ${estimate.roof_squares_avg || 20} square roof. Material: ${estimate.material_type || "asphalt"}. Complexity: ${estimate.complexity_rating || "medium"}.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 150,
    });

    return completion.choices[0]?.message?.content?.trim() || "Roof inspection completed. Replacement recommended.";
  } catch (error) {
    console.error("Error generating inspection summary:", error);
    return "Roof inspection completed. Replacement recommended.";
  }
}

/**
 * Generate insurance-specific mode data
 */
export function generateInsuranceMode(claimFinancials?: any): InsuranceMode | undefined {
  if (!claimFinancials || (!claimFinancials.rcv_total && !claimFinancials.acv_total)) {
    return undefined;
  }

  const rcv = claimFinancials.rcv_total || claimFinancials.acv_total || 0;
  const acv = claimFinancials.acv_total || Math.round(rcv * 0.6);
  const deductible = claimFinancials.deductible || 0;
  const depreciation = rcv - acv;
  const depreciationRecoverable = claimFinancials.depreciation_recoverable ?? true;

  return {
    is_insurance_claim: true,
    deductible_explanation: `Your deductible of $${deductible.toLocaleString()} is your portion of the claim. This is standard with all insurance claims.`,
    acv_vs_rcv: {
      acv,
      rcv,
      explanation: `ACV (Actual Cash Value) of $${acv.toLocaleString()} is what you receive first. RCV (Replacement Cost Value) of $${rcv.toLocaleString()} is the total coverage. ${depreciationRecoverable ? `You'll receive the remaining $${depreciation.toLocaleString()} after work is complete.` : "Depreciation is non-recoverable."}`,
    },
    depreciation_logic: depreciationRecoverable
      ? `Depreciation of $${depreciation.toLocaleString()} is recoverable. You'll receive this amount after installation is complete and we submit final documentation.`
      : `Depreciation of $${depreciation.toLocaleString()} is non-recoverable per your policy.`,
    upgrade_opportunities: [
      "You can upgrade materials and pay the difference",
      "Color upgrades available",
      "Extended warranty options",
    ],
    supplement_explanation:
      "If we discover additional damage during installation, we'll submit a supplement to your insurance for approval.",
    color_choices: ["Charcoal", "Slate Gray", "Weathered Wood", "Colonial Slate"],
    required_code_items: ["Ice & water shield", "Drip edge", "Ridge vent", "Starter strip"],
    timeline_expectations:
      "After approval, materials arrive in 1-2 business days. Installation typically takes 1 day. Depreciation check arrives 7-14 days after completion.",
  };
}

/**
 * Build comprehensive Proposal V1 data structure
 */
export function buildProposalV1Data(params: {
  homeownerName: string;
  propertyAddress: string;
  estimate: any;
  roofScope?: any;
  claimFinancials?: any;
  contractorPreferences: ContractorPreferences;
  photos?: Array<{ url: string; description?: string; severity?: string }>;
}): ProposalV1Data {
  const { homeownerName, propertyAddress, estimate, roofScope, claimFinancials, contractorPreferences, photos } =
    params;

  // Build base proposal data (reuse existing function)
  const baseProposalData = {
    homeowner_name: homeownerName,
    property_address: propertyAddress,
    roof_summary: {
      scope: `${estimate.roof_squares_avg || estimate.roof_squares_min || 20} squares`,
      material: estimate.material_type === "asphalt"
        ? `${estimate.shingle_type || "Architectural"} Asphalt Shingle`
        : estimate.material_type || "Architectural Asphalt Shingle",
      code_items: estimate.insurance_code_items?.map((item: any) => item.description) || [
        "Ice & water shield",
        "Ridge vent",
        "Drip edge",
      ],
    },
    project_price: estimate.estimated_total_avg || estimate.estimated_total_min || 0,
    insurance_comparison: claimFinancials
      ? {
          carrier: claimFinancials.carrier || "Your Insurance Carrier",
          rcv_total: claimFinancials.rcv_total || claimFinancials.acv_total || 0,
          deductible: claimFinancials.deductible || 0,
          depreciation_recoverable: claimFinancials.depreciation_recoverable ?? true,
          notes: "Estimate aligns with insurance scope.",
        }
      : undefined,
    line_items:
      estimate.estimate_line_items?.map((item: any) => ({
        description: item.description,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        total_cost: item.total_cost,
      })) || [],
    warranty: contractorPreferences.warranty_type || "10-year workmanship warranty. Manufacturer warranty based on shingle selection.",
    timeline: estimate.estimated_job_duration_days_min && estimate.estimated_job_duration_days_max
      ? `Materials delivered within 1–2 business days. Full installation completed in ${estimate.estimated_job_duration_days_min}-${estimate.estimated_job_duration_days_max} day${estimate.estimated_job_duration_days_max > 1 ? "s" : ""}. Final inspection and cleanup included.`
      : "Materials delivered within 1–2 business days. Full installation completed in 1 day. Final inspection and cleanup included.",
    next_steps: contractorPreferences.payment_expectations
      ? `Click the button below to confirm and schedule your installation. ${contractorPreferences.payment_expectations}`
      : "Click the button below to confirm and schedule your installation.",
  };

  // Generate V1-specific data
  const basePrice = baseProposalData.project_price;
  const pricingTierModel = generatePricingTiers(basePrice, estimate);
  const upgradeOptions = generateUpgradeOptions(estimate, roofScope);
  const warrantyDetails = generateWarrantyDetails(contractorPreferences, "better");
  const insuranceMode = generateInsuranceMode(claimFinancials);

  return {
    ...baseProposalData,
    pricing_tier_model: pricingTierModel,
    upgrade_options: upgradeOptions,
    warranty_details: warrantyDetails,
    insurance_mode: insuranceMode,
    // Visual elements and inspection sections will be populated async
    visual_elements: {},
    inspection_sections: undefined, // Will be populated async
  };
}

/**
 * Generate enhanced proposal text with V1 features
 */
export async function generateProposalV1Text(
  proposalData: ProposalV1Data,
  contractorPreferences: ContractorPreferences
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const companyName = contractorPreferences.company_name || "Your Roofing Company";
  const messageStyle = contractorPreferences.message_style || "friendly";

  const systemPrompt = `You are SmartSend Proposal Builder v1 - an AI that writes premium, psychology-optimized roofing proposals that convert.

CRITICAL RULES:
- Write in clear, simple language (6th-8th grade reading level)
- NO contractor jargon - translate everything to homeowner terms
- Be professional but warm and trustworthy
- Use short paragraphs (2-3 sentences max)
- Include psychology elements: urgency, trust, value anchoring
- Make pricing tiers clear and compelling
- Highlight warranty and protection
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
3. Inspection Summary: Clear explanation of roof condition
4. What We Found: Key findings with photos
5. Pricing Options: Good/Better/Best tiers (highlight "Most Popular")
6. Total Project Cost: Clear pricing breakdown
7. Insurance Details: If applicable, explain RCV, deductible, depreciation
8. Warranty: Explain warranty coverage with visuals
9. Upgrade Options: Available add-ons
10. Project Timeline: When materials arrive, installation schedule
11. Next Steps: Clear call-to-action with urgency

Return ONLY the proposal text, no markdown formatting.`;

  const pricingTiers = proposalData.pricing_tier_model;
  const insuranceMode = proposalData.insurance_mode;

  const userPrompt = `Generate a premium roofing proposal for:

Homeowner: ${proposalData.homeowner_name}
Property: ${proposalData.property_address}
Company: ${companyName}

${pricingTiers ? `
Pricing Options:
- GOOD (Economy): $${pricingTiers.good.price.toLocaleString()} - ${pricingTiers.good.description}
- BETTER (Most Popular): $${pricingTiers.better.price.toLocaleString()} - ${pricingTiers.better.description} ⭐
- BEST (Premium): $${pricingTiers.best.price.toLocaleString()} - ${pricingTiers.best.description}
` : ""}

Roof Summary:
- ${proposalData.roof_summary.scope}
- Material: ${proposalData.roof_summary.material}
- Code Items: ${proposalData.roof_summary.code_items.join(", ") || "Standard code-compliant installation"}

${insuranceMode ? `
Insurance Details:
- Carrier: ${insuranceMode.acv_vs_rcv?.rcv ? "Insurance claim" : "N/A"}
- RCV: $${insuranceMode.acv_vs_rcv?.rcv.toLocaleString()}
- ACV: $${insuranceMode.acv_vs_rcv?.acv.toLocaleString()}
- Deductible: $${insuranceMode.acv_vs_rcv ? (insuranceMode.acv_vs_rcv.rcv - insuranceMode.acv_vs_rcv.acv).toLocaleString() : "0"}
- ${insuranceMode.depreciation_logic}
` : ""}

Warranty: ${proposalData.warranty}

Timeline: ${proposalData.timeline}

${proposalData.upgrade_options && proposalData.upgrade_options.length > 0 ? `
Available Upgrades:
${proposalData.upgrade_options.map((u) => `- ${u.name}: $${u.price.toLocaleString()} - ${u.description}`).join("\n")}
` : ""}

Generate the full proposal text in a ${messageStyle} tone with psychology-optimized language.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return completion.choices[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("Error generating proposal V1 text:", error);
    throw error;
  }
}




































