// Block 18800 — SmartSend Roofing Terminology Translator v1
// AI Engine That Translates Homeowner Language → Exact Roofing Terms

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface TerminologyTranslation {
  roofingTerm: string;
  materialType: string | null;
  damageType: string;
  repairCategory: string;
  stormCategory: string;
  insuranceCategory: string;
  urgencyLevel: "emergency" | "high" | "medium" | "low" | "uncertain";
  severityScore: number;
  aiExplanation: string;
  detectedKeywords: string[];
  keywordExplanations: Record<string, string>;
  detectedMaterial: string | null;
  materialConfidence: number;
  stormImpactScore: number;
  replacementProbability: "high" | "medium" | "low" | "uncertain";
  replacementLikelihoodScore: number;
  recommendedAction: string;
  recommendedTasks: string[];
  repairCostRange: { min: number | null; max: number | null };
  translationConfidence: number;
}

// Industry keywords to detect and highlight
const INDUSTRY_KEYWORDS = [
  "leak",
  "missing",
  "hail",
  "wind",
  "insurance",
  "adjuster",
  "claim",
  "brown spot",
  "water damage",
  "stain",
  "mold",
  "curled",
  "lifted",
  "blown off",
  "cracked",
  "granule",
  "flashing",
  "vent",
  "chimney",
  "skylight",
  "sagging",
  "soft spot",
  "buckling",
  "moss",
  "algae",
  "dented",
  "bruised",
  "storm",
  "damage",
  "repair",
  "replace",
  "roof",
  "shingle",
  "tile",
  "metal",
  "flat roof",
];

// Keyword explanations for contractors
const KEYWORD_EXPLANATIONS: Record<string, string> = {
  leak: "Indicates active water intrusion - high priority",
  missing: "Shingles or components missing - likely wind damage",
  hail: "Hail impact damage - insurance claim opportunity",
  wind: "Wind damage - storm-related insurance claim",
  insurance: "Homeowner mentions insurance - claim opportunity",
  adjuster: "Insurance adjuster involved - claim in process",
  claim: "Insurance claim mentioned - high-value opportunity",
  "brown spot": "Interior water stain - active leak indicator",
  "water damage": "Water intrusion evidence - urgent repair needed",
  stain: "Ceiling or wall stain - leak indicator",
  mold: "Mold growth - moisture retention issue",
  curled: "Shingle curling - aging or heat exposure",
  lifted: "Shingles lifted - wind uplift damage",
  "blown off": "Shingles blown off - wind damage",
  cracked: "Cracked shingles or tiles - impact or aging",
  granule: "Granule loss - shingle deterioration",
  flashing: "Flashing issue - common leak source",
  vent: "Vent flashing issue - common leak point",
  chimney: "Chimney flashing problem - step flashing needed",
  skylight: "Skylight leak - flashing or seal issue",
  sagging: "Roof sagging - structural concern",
  "soft spot": "Soft decking - water damage to structure",
  buckling: "Underlayment buckling - moisture issue",
  moss: "Moss growth - moisture retention",
  algae: "Algae growth - cosmetic but indicates moisture",
  dented: "Metal denting - hail or debris impact",
  bruised: "Hail bruising - insurance claim indicator",
  storm: "Storm damage mentioned - insurance opportunity",
  damage: "General damage reference - needs inspection",
  repair: "Repair needed - service opportunity",
  replace: "Replacement mentioned - high-value opportunity",
};

// Damage type mappings
const DAMAGE_TYPE_MAPPINGS: Record<string, string> = {
  structural: "structural",
  shingle: "shingle",
  flashing: "flashing",
  ventilation: "ventilation",
  interior_leak: "interior_leak",
};

// Repair category mappings
const REPAIR_CATEGORY_MAPPINGS: Record<string, string> = {
  emergency: "emergency",
  urgent: "urgent",
  routine: "routine",
  maintenance: "maintenance",
  replacement: "replacement",
};

// Storm category mappings
const STORM_CATEGORY_MAPPINGS: Record<string, string> = {
  hail: "hail",
  wind: "wind",
  storm: "storm",
  wear_tear: "wear_tear",
  aging: "aging",
  manufacturer_defect: "manufacturer_defect",
  improper_installation: "improper_installation",
};

// Insurance category mappings
const INSURANCE_CATEGORY_MAPPINGS: Record<string, string> = {
  storm: "storm",
  wear_tear: "wear_tear",
  manufacturer_defect: "manufacturer_defect",
  improper_installation: "improper_installation",
  aging: "aging",
  emergency_leak: "emergency_leak",
};

/**
 * Translate homeowner message to roofing terminology
 */
export async function translateHomeownerMessage(
  message: string,
  contactId?: string,
  workspaceId?: string
): Promise<TerminologyTranslation> {
  const systemPrompt = `You are a roofing terminology translator. Your job is to translate what homeowners say into exact roofing terminology that contractors need.

Homeowners often say things like:
- "shingles fell off" → translate to "wind uplift on ridge cap"
- "my roof looks weird" → translate to "granule loss on west slope"
- "there's a brown spot on my ceiling" → translate to "interior moisture intrusion"
- "the metal thing is loose" → translate to "loose flashing around vent pipe"
- "I see a bump under the roof" → translate to "buckling underlayment"

You must classify everything into these categories:
1. Structural Roof Problems: sagging, soft spots, decking issues
2. Shingle Problems: missing, lifted, blown-off, cracked, granule loss
3. Flashing Problems: chimney, skylight, valleys, step flashing
4. Ventilation Problems: attic moisture, ridge vent issues
5. Interior Leak Evidence: stains, mold, peeling paint, humidity issues

Return a JSON object with:
- roofingTerm: The exact roofing term (e.g., "wind uplift on ridge cap")
- materialType: One of: asphalt_shingle, metal, tile, flat, slate, wood_shake, or null
- damageType: One of: structural, shingle, flashing, ventilation, interior_leak
- repairCategory: One of: emergency, urgent, routine, maintenance, replacement
- stormCategory: One of: hail, wind, storm, wear_tear, aging, manufacturer_defect, improper_installation
- insuranceCategory: One of: storm, wear_tear, manufacturer_defect, improper_installation, aging, emergency_leak
- urgencyLevel: One of: emergency, high, medium, low, uncertain
- severityScore: Number 0-100 (curled shingles=40, interior stain=85, missing shingles=75, cracked tile=70, metal denting=65, pipe boot crack=60, vent flashing issue=55, moss growth=25)
- aiExplanation: A clear explanation of "What the homeowner REALLY means" (2-3 sentences)
- detectedKeywords: Array of industry keywords found (leak, missing, hail, wind, insurance, adjuster, claim, brown spot, water damage, etc.)
- keywordExplanations: Object mapping keywords to brief explanations
- detectedMaterial: Material type detected from message (or null)
- materialConfidence: Confidence 0-100 for material detection
- stormImpactScore: 0-100 score for storm impact (add +15 if storm mentioned)
- replacementProbability: One of: high, medium, low, uncertain (based on wording like "roof is old", "house built in 2002", "multiple leaks", "missing shingles for years")
- replacementLikelihoodScore: 0-100 score for replacement likelihood
- recommendedAction: What action to take (e.g., "Schedule inspection within 72 hours")
- recommendedTasks: Array of suggested tasks (e.g., ["emergency_call_homeowner", "schedule_asap", "prepare_inspection", "bring_moisture_meter"])
- repairCostRange: Object with min and max estimated cost (can be null)
- translationConfidence: Your confidence in this translation 0-100

Be precise and professional. Contractors need exact terminology.`;

  const userPrompt = `Translate this homeowner message into roofing terminology:

"${message}"

Return ONLY valid JSON, no other text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Lower temperature for more consistent translations
      max_tokens: 1500,
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const translation = JSON.parse(responseText) as TerminologyTranslation;

    // Enhance with keyword detection
    const detectedKeywords = detectKeywords(message);
    const keywordExplanations: Record<string, string> = {};
    
    detectedKeywords.forEach((keyword) => {
      if (KEYWORD_EXPLANATIONS[keyword.toLowerCase()]) {
        keywordExplanations[keyword] = KEYWORD_EXPLANATIONS[keyword.toLowerCase()];
      }
    });

    // Merge detected keywords with AI-detected ones
    const allKeywords = [
      ...new Set([
        ...(translation.detectedKeywords || []),
        ...detectedKeywords,
      ]),
    ];

    return {
      ...translation,
      detectedKeywords: allKeywords,
      keywordExplanations: {
        ...translation.keywordExplanations,
        ...keywordExplanations,
      },
    };
  } catch (error) {
    console.error("Error translating homeowner message:", error);
    
    // Fallback translation
    return createFallbackTranslation(message);
  }
}

/**
 * Detect industry keywords in message
 */
function detectKeywords(message: string): string[] {
  const lowerMessage = message.toLowerCase();
  const found: string[] = [];

  INDUSTRY_KEYWORDS.forEach((keyword) => {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      found.push(keyword);
    }
  });

  return found;
}

/**
 * Create fallback translation when AI fails
 */
function createFallbackTranslation(message: string): TerminologyTranslation {
  const detectedKeywords = detectKeywords(message);
  const hasLeak = message.toLowerCase().includes("leak") || 
                  message.toLowerCase().includes("water") ||
                  message.toLowerCase().includes("stain");
  const hasStorm = message.toLowerCase().includes("storm") ||
                   message.toLowerCase().includes("hail") ||
                   message.toLowerCase().includes("wind");
  const hasMissing = message.toLowerCase().includes("missing") ||
                     message.toLowerCase().includes("fell off") ||
                     message.toLowerCase().includes("blown");

  return {
    roofingTerm: "General roofing concern - needs inspection",
    materialType: null,
    damageType: hasLeak ? "interior_leak" : "general",
    repairCategory: hasLeak ? "emergency" : "routine",
    stormCategory: hasStorm ? "storm" : "wear_tear",
    insuranceCategory: hasStorm ? "storm" : "wear_tear",
    urgencyLevel: hasLeak ? "high" : "medium",
    severityScore: hasLeak ? 70 : hasMissing ? 60 : 40,
    aiExplanation: "Unable to generate AI explanation. Manual review recommended.",
    detectedKeywords,
    keywordExplanations: {},
    detectedMaterial: null,
    materialConfidence: 0,
    stormImpactScore: hasStorm ? 15 : 0,
    replacementProbability: "uncertain",
    replacementLikelihoodScore: 0,
    recommendedAction: "Schedule inspection to assess issue",
    recommendedTasks: hasLeak 
      ? ["emergency_call_homeowner", "schedule_asap"]
      : ["schedule_inspection"],
    repairCostRange: { min: null, max: null },
    translationConfidence: 30,
  };
}

/**
 * Calculate replacement probability from message
 */
export function calculateReplacementProbability(message: string): {
  probability: "high" | "medium" | "low" | "uncertain";
  score: number;
} {
  const lowerMessage = message.toLowerCase();
  let score = 0;

  // High probability indicators
  if (
    lowerMessage.includes("old") ||
    lowerMessage.includes("years old") ||
    lowerMessage.includes("original roof") ||
    lowerMessage.includes("never replaced")
  ) {
    score += 30;
  }

  if (
    lowerMessage.includes("multiple") ||
    lowerMessage.includes("several") ||
    lowerMessage.includes("many")
  ) {
    score += 20;
  }

  if (
    lowerMessage.includes("leak") ||
    lowerMessage.includes("leaks")
  ) {
    score += 15;
  }

  if (
    lowerMessage.includes("missing") ||
    lowerMessage.includes("fell off") ||
    lowerMessage.includes("blown")
  ) {
    score += 15;
  }

  if (
    lowerMessage.includes("storm") ||
    lowerMessage.includes("hail") ||
    lowerMessage.includes("wind")
  ) {
    score += 10;
  }

  // Year mentions
  const yearMatch = lowerMessage.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0]);
    const age = new Date().getFullYear() - year;
    if (age > 20) {
      score += 25;
    } else if (age > 15) {
      score += 15;
    }
  }

  if (score >= 60) {
    return { probability: "high", score: Math.min(score, 100) };
  } else if (score >= 35) {
    return { probability: "medium", score };
  } else if (score >= 15) {
    return { probability: "low", score };
  } else {
    return { probability: "uncertain", score: 0 };
  }
}

/**
 * Detect material type from message
 */
export function detectMaterialFromMessage(message: string): {
  material: string | null;
  confidence: number;
} {
  const lowerMessage = message.toLowerCase();

  // Material detection patterns
  const patterns: Array<{ material: string; keywords: string[]; confidence: number }> = [
    {
      material: "asphalt_shingle",
      keywords: ["shingle", "asphalt", "composition", "3-tab", "architectural"],
      confidence: 90,
    },
    {
      material: "metal",
      keywords: ["metal", "tin", "steel", "standing seam", "corrugated"],
      confidence: 85,
    },
    {
      material: "tile",
      keywords: ["tile", "clay", "concrete", "spanish tile"],
      confidence: 85,
    },
    {
      material: "flat",
      keywords: ["flat roof", "tpo", "epdm", "rubber", "membrane"],
      confidence: 80,
    },
    {
      material: "slate",
      keywords: ["slate"],
      confidence: 90,
    },
    {
      material: "wood_shake",
      keywords: ["wood", "cedar", "shake"],
      confidence: 85,
    },
  ];

  for (const pattern of patterns) {
    const matches = pattern.keywords.filter((keyword) =>
      lowerMessage.includes(keyword)
    );
    if (matches.length > 0) {
      return {
        material: pattern.material,
        confidence: pattern.confidence,
      };
    }
  }

  return { material: null, confidence: 0 };
}





















































