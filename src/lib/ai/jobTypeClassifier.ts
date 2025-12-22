import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ============================================================================
// TYPES
// ============================================================================

export type JobType =
  | "roof_repair"
  | "roof_replacement"
  | "emergency_leak_repair"
  | "storm_damage"
  | "insurance_driven_claim"
  | "gutter_repair_replacement"
  | "inspection_only"
  | "general_question"
  | "not_roofing";

export type SeverityLevel = "low" | "medium" | "high";

export type InsuranceVsRetail = "insurance" | "retail" | "unclear";

export interface JobTypeClassificationResult {
  // Primary classification
  jobType: JobType;
  jobTypeConfidence: number;
  
  // Subcategory (e.g., "shingle_repair", "chimney_leak", "hail_damage")
  subcategory: string | null;
  subcategoryConfidence: number;
  
  // Severity level
  severityLevel: SeverityLevel;
  severityConfidence: number;
  
  // Insurance vs Retail
  insuranceVsRetail: InsuranceVsRetail;
  insuranceVsRetailConfidence: number;
  
  // Missing information detection
  missingInformation: string[];
  
  // Estimated job value (based on job type, severity, insurance status)
  estimatedValue: {
    min: number;
    max: number;
    confidence: number;
  };
  
  // Suggested workflow
  suggestedWorkflow: string | null;
  
  // Metadata
  detectedKeywords: string[];
  reasoning: string;
  rawAiResponse: any;
}

// ============================================================================
// JOB TYPE VALUE ESTIMATES (Based on typical roofing job ranges)
// ============================================================================

const JOB_TYPE_VALUE_RANGES: Record<JobType, { min: number; max: number }> = {
  roof_repair: { min: 150, max: 3500 },
  roof_replacement: { min: 5000, max: 30000 },
  emergency_leak_repair: { min: 200, max: 800 },
  storm_damage: { min: 3000, max: 25000 },
  insurance_driven_claim: { min: 5000, max: 35000 },
  gutter_repair_replacement: { min: 300, max: 2500 },
  inspection_only: { min: 0, max: 0 },
  general_question: { min: 0, max: 0 },
  not_roofing: { min: 0, max: 0 },
};

const SEVERITY_MULTIPLIERS: Record<SeverityLevel, { min: number; max: number }> = {
  low: { min: 0.7, max: 1.0 },
  medium: { min: 1.0, max: 1.3 },
  high: { min: 1.2, max: 1.8 },
};

const INSURANCE_MULTIPLIERS: Record<InsuranceVsRetail, { min: number; max: number }> = {
  insurance: { min: 1.2, max: 2.0 },
  retail: { min: 0.8, max: 1.2 },
  unclear: { min: 0.9, max: 1.3 },
};

// ============================================================================
// MAIN CLASSIFICATION FUNCTION
// ============================================================================

/**
 * SmartSend AI Job Type Classifier
 * 
 * Analyzes homeowner messages to determine:
 * - Primary job type (repair, replacement, storm, etc.)
 * - Subcategory (specific issue type)
 * - Severity level (low, medium, high)
 * - Insurance vs Retail classification
 * - Missing information detection
 * - Estimated job value
 * - Suggested workflow
 */
export async function classifyJobType(
  text: string,
  subject?: string,
  context?: {
    zipCode?: string;
    homeDescription?: string;
    hasPhotos?: boolean;
  }
): Promise<JobTypeClassificationResult> {
  const fullText = [subject, text].filter(Boolean).join("\n\n");
  const trimmed = fullText.trim().slice(0, 6000);

  if (!trimmed) {
    return getDefaultResult("general_question", "low", "unclear", "Empty message");
  }

  const lowerText = trimmed.toLowerCase();

  // Quick rule-based checks for high-confidence cases
  const hasInsuranceKeywords = /\b(adjuster|claim|insurance|deductible|acv|rcv|coverage|carrier|filed\s+a\s+claim|insurance\s+said|insurance\s+is\s+sending)\b/i.test(lowerText);
  const hasRetailKeywords = /\b(how\s+much|quote|price|cost|cash\s+price|out\s+of\s+pocket|pay\s+cash)\b/i.test(lowerText);
  const hasUrgentKeywords = /\b(leak|leaking|water|emergency|urgent|asap|immediately|now|fast|coming\s+in)\b/i.test(lowerText);
  const hasStormKeywords = /\b(storm|hail|wind|blown\s+off|tree\s+limb|damage\s+from|weather)\b/i.test(lowerText);
  const hasReplacementKeywords = /\b(new\s+roof|replace|replacement|tear\s+off|full\s+roof|entire\s+roof|15\+?\s+years|old\s+roof)\b/i.test(lowerText);
  const hasRepairKeywords = /\b(repair|fix|patch|shingle|flashing|chimney|skylight|valley|ridge|fascia|soffit|pipe\s+boot)\b/i.test(lowerText);
  const hasGutterKeywords = /\b(gutter|downspout|drain|water\s+flow)\b/i.test(lowerText);
  const hasInspectionKeywords = /\b(inspect|inspection|look\s+at|check|evaluate|assess)\b/i.test(lowerText);

  try {
    const systemPrompt = `You are SmartSend AI Job Type Classifier - a specialized roofing intelligence system.

Analyze homeowner messages and classify the roofing job with precision:

1. PRIMARY JOB TYPE (choose ONE):
   - roof_repair: General repair work (shingles, flashing, patches, etc.)
   - roof_replacement: Full or partial roof replacement
   - emergency_leak_repair: Active leak requiring immediate attention
   - storm_damage: Wind, hail, or weather-related damage
   - insurance_driven_claim: Insurance claim is involved or mentioned
   - gutter_repair_replacement: Gutter-related work
   - inspection_only: Just wants inspection/evaluation, no work yet
   - general_question: General questions about roofing
   - not_roofing: Not a roofing-related inquiry

2. SUBCATEGORY (specific issue within job type):
   For roof_repair:
   - shingle_repair, flashing_repair, pipe_boot_repair, skylight_leak, chimney_leak, valley_repair, ridge_cap_issue, small_patch, fascia_soffit_damage
   
   For roof_replacement:
   - full_tear_off, partial_replacement, old_roof_15plus_years, worn_shingles, storm_replacement, insurance_replacement
   
   For storm_damage:
   - hail, wind, tree_limb_impact, blown_shingles
   
   Return null if no specific subcategory applies.

3. SEVERITY LEVEL (low, medium, high):
   - low: "A couple shingles came off", "small drip", minor cosmetic issues
   - medium: "roof leaking near bathroom", "stain spreading", moderate damage
   - high: "active leak in kitchen", "water coming in FAST", "ceiling sagging", emergency situation

4. INSURANCE VS RETAIL:
   - insurance: Mentions adjuster, claim, deductible, insurance inspection, "insurance said"
   - retail: "How much?", "Can I get a quote?", "cash price?", out-of-pocket payment
   - unclear: No clear indication either way

5. MISSING INFORMATION:
   Detect what information is missing for this job type:
   - For repairs: address, photos, timeline, specific leak location
   - For replacements: roof age, insurance info, roof size, photos
   - For storm damage: date of storm, photos, insurance claim status
   - Return as array of strings like: ["photos", "address", "roof_age"]

6. ESTIMATED VALUE:
   Provide min/max value range based on job type, severity, and insurance status.
   Use these base ranges:
   - Leak repair: $150-$350
   - Chimney flashing: $600-$900
   - Hail replacement: $7,000-$18,000
   - Full tear-off: $9,000-$30,000
   - Adjust for severity (high = higher range) and insurance (insurance = higher range)

7. SUGGESTED WORKFLOW:
   - repair_workflow: Quick response, send repair tech, low-ticket flow
   - replacement_workflow: Estimator needed, schedule inspection, full pipeline
   - insurance_workflow: Documentation tasks, adjuster meeting, insurance timeline
   - storm_workflow: Priority queue, emergency follow-up, storm team
   - inspection_workflow: Schedule inspection, gather info
   - Return null if no specific workflow applies

Return JSON with this structure:
{
  "jobType": "roof_repair",
  "jobTypeConfidence": 0.95,
  "subcategory": "chimney_leak",
  "subcategoryConfidence": 0.90,
  "severityLevel": "medium",
  "severityConfidence": 0.85,
  "insuranceVsRetail": "retail",
  "insuranceVsRetailConfidence": 0.80,
  "missingInformation": ["photos", "specific_location"],
  "estimatedValue": {
    "min": 600,
    "max": 900,
    "confidence": 0.75
  },
  "suggestedWorkflow": "repair_workflow",
  "detectedKeywords": ["leak", "chimney", "water"],
  "reasoning": "Homeowner reports chimney leak, wants repair quote"
}`;

    const userPrompt = `Analyze this homeowner message for a roofing company:

Subject: ${subject || "(no subject)"}

Message:
${trimmed}

${context?.zipCode ? `Location: ${context.zipCode}` : ""}
${context?.homeDescription ? `Home: ${context.homeDescription}` : ""}
${context?.hasPhotos ? "Photos: Yes" : "Photos: No"}

Provide comprehensive job type classification.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content);

    // Validate and normalize the response
    const jobType = validateJobType(parsed.jobType) || inferJobType(lowerText, {
      hasInsuranceKeywords,
      hasRetailKeywords,
      hasUrgentKeywords,
      hasStormKeywords,
      hasReplacementKeywords,
      hasRepairKeywords,
      hasGutterKeywords,
      hasInspectionKeywords,
    });

    const severityLevel = validateSeverityLevel(parsed.severityLevel) || inferSeverityLevel(lowerText);
    const insuranceVsRetail = validateInsuranceVsRetail(parsed.insuranceVsRetail) || inferInsuranceVsRetail(hasInsuranceKeywords, hasRetailKeywords);

    // Calculate estimated value
    const baseRange = JOB_TYPE_VALUE_RANGES[jobType];
    const severityMultiplier = SEVERITY_MULTIPLIERS[severityLevel];
    const insuranceMultiplier = INSURANCE_MULTIPLIERS[insuranceVsRetail];

    const estimatedMin = Math.round(baseRange.min * severityMultiplier.min * insuranceMultiplier.min);
    const estimatedMax = Math.round(baseRange.max * severityMultiplier.max * insuranceMultiplier.max);

    const result: JobTypeClassificationResult = {
      jobType,
      jobTypeConfidence: Math.max(0, Math.min(1, Number(parsed.jobTypeConfidence ?? 0.7))),
      
      subcategory: parsed.subcategory || null,
      subcategoryConfidence: parsed.subcategory ? Math.max(0, Math.min(1, Number(parsed.subcategoryConfidence ?? 0.7))) : 0,
      
      severityLevel,
      severityConfidence: Math.max(0, Math.min(1, Number(parsed.severityConfidence ?? 0.7))),
      
      insuranceVsRetail,
      insuranceVsRetailConfidence: Math.max(0, Math.min(1, Number(parsed.insuranceVsRetailConfidence ?? 0.7))),
      
      missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation : [],
      
      estimatedValue: {
        min: parsed.estimatedValue?.min ?? estimatedMin,
        max: parsed.estimatedValue?.max ?? estimatedMax,
        confidence: Math.max(0, Math.min(1, Number(parsed.estimatedValue?.confidence ?? 0.7)))
      },
      
      suggestedWorkflow: parsed.suggestedWorkflow || null,
      
      detectedKeywords: Array.isArray(parsed.detectedKeywords) ? parsed.detectedKeywords : extractKeywords(lowerText),
      reasoning: String(parsed.reasoning || "AI classification"),
      rawAiResponse: parsed
    };

    return result;

  } catch (error) {
    console.error("Error classifying job type:", error);
    // Fallback to rule-based classification
    return getFallbackResult(trimmed, lowerText, {
      hasInsuranceKeywords,
      hasRetailKeywords,
      hasUrgentKeywords,
      hasStormKeywords,
      hasReplacementKeywords,
      hasRepairKeywords,
      hasGutterKeywords,
      hasInspectionKeywords,
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function validateJobType(jobType: any): JobType | null {
  const validTypes: JobType[] = [
    "roof_repair",
    "roof_replacement",
    "emergency_leak_repair",
    "storm_damage",
    "insurance_driven_claim",
    "gutter_repair_replacement",
    "inspection_only",
    "general_question",
    "not_roofing"
  ];
  return validTypes.includes(jobType) ? jobType : null;
}

function validateSeverityLevel(severity: any): SeverityLevel | null {
  const validLevels: SeverityLevel[] = ["low", "medium", "high"];
  return validLevels.includes(severity) ? severity : null;
}

function validateInsuranceVsRetail(value: any): InsuranceVsRetail | null {
  const validValues: InsuranceVsRetail[] = ["insurance", "retail", "unclear"];
  return validValues.includes(value) ? value : null;
}

function inferJobType(
  text: string,
  flags: {
    hasInsuranceKeywords: boolean;
    hasRetailKeywords: boolean;
    hasUrgentKeywords: boolean;
    hasStormKeywords: boolean;
    hasReplacementKeywords: boolean;
    hasRepairKeywords: boolean;
    hasGutterKeywords: boolean;
    hasInspectionKeywords: boolean;
  }
): JobType {
  if (flags.hasInsuranceKeywords) return "insurance_driven_claim";
  if (flags.hasUrgentKeywords && /\b(leak|leaking|water)\b/i.test(text)) return "emergency_leak_repair";
  if (flags.hasStormKeywords) return "storm_damage";
  if (flags.hasGutterKeywords) return "gutter_repair_replacement";
  if (flags.hasReplacementKeywords) return "roof_replacement";
  if (flags.hasRepairKeywords) return "roof_repair";
  if (flags.hasInspectionKeywords && !flags.hasRepairKeywords && !flags.hasReplacementKeywords) return "inspection_only";
  return "general_question";
}

function inferSeverityLevel(text: string): SeverityLevel {
  const highPatterns = [
    /\b(active\s+leak|water\s+coming\s+in|ceiling\s+sagging|emergency|urgent|asap|fast|immediately)\b/i
  ];
  const lowPatterns = [
    /\b(couple|few|small|minor|cosmetic|just\s+a\s+bit)\b/i
  ];
  
  if (highPatterns.some(p => p.test(text))) return "high";
  if (lowPatterns.some(p => p.test(text))) return "low";
  return "medium";
}

function inferInsuranceVsRetail(hasInsurance: boolean, hasRetail: boolean): InsuranceVsRetail {
  if (hasInsurance) return "insurance";
  if (hasRetail) return "retail";
  return "unclear";
}

function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  const patterns = [
    { pattern: /\bleak|leaking\b/i, keyword: "leak" },
    { pattern: /\bshingle\b/i, keyword: "shingle" },
    { pattern: /\bchimney\b/i, keyword: "chimney" },
    { pattern: /\bstorm\b/i, keyword: "storm" },
    { pattern: /\bhail\b/i, keyword: "hail" },
    { pattern: /\bwind\b/i, keyword: "wind" },
    { pattern: /\binsurance\b/i, keyword: "insurance" },
    { pattern: /\badjuster\b/i, keyword: "adjuster" },
    { pattern: /\bclaim\b/i, keyword: "claim" },
    { pattern: /\breplace|replacement\b/i, keyword: "replacement" },
    { pattern: /\brepair\b/i, keyword: "repair" },
    { pattern: /\binspect|inspection\b/i, keyword: "inspection" },
  ];
  
  patterns.forEach(({ pattern, keyword }) => {
    if (pattern.test(text) && !keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  });
  
  return keywords;
}

function getDefaultResult(
  jobType: JobType,
  severity: SeverityLevel,
  insuranceVsRetail: InsuranceVsRetail,
  reasoning: string
): JobTypeClassificationResult {
  const baseRange = JOB_TYPE_VALUE_RANGES[jobType];
  const severityMultiplier = SEVERITY_MULTIPLIERS[severity];
  const insuranceMultiplier = INSURANCE_MULTIPLIERS[insuranceVsRetail];

  return {
    jobType,
    jobTypeConfidence: 0.5,
    subcategory: null,
    subcategoryConfidence: 0,
    severityLevel: severity,
    severityConfidence: 0.5,
    insuranceVsRetail,
    insuranceVsRetailConfidence: 0.5,
    missingInformation: [],
    estimatedValue: {
      min: Math.round(baseRange.min * severityMultiplier.min * insuranceMultiplier.min),
      max: Math.round(baseRange.max * severityMultiplier.max * insuranceMultiplier.max),
      confidence: 0.5
    },
    suggestedWorkflow: null,
    detectedKeywords: [],
    reasoning,
    rawAiResponse: {}
  };
}

function getFallbackResult(
  text: string,
  lowerText: string,
  flags: {
    hasInsuranceKeywords: boolean;
    hasRetailKeywords: boolean;
    hasUrgentKeywords: boolean;
    hasStormKeywords: boolean;
    hasReplacementKeywords: boolean;
    hasRepairKeywords: boolean;
    hasGutterKeywords: boolean;
    hasInspectionKeywords: boolean;
  }
): JobTypeClassificationResult {
  const jobType = inferJobType(lowerText, flags);
  const severity = inferSeverityLevel(lowerText);
  const insuranceVsRetail = inferInsuranceVsRetail(flags.hasInsuranceKeywords, flags.hasRetailKeywords);
  
  return {
    ...getDefaultResult(jobType, severity, insuranceVsRetail, "Rule-based fallback classification"),
    detectedKeywords: extractKeywords(lowerText)
  };
}



















































