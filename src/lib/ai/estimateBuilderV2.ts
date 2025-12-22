// Block 20020 — SmartSend Inbox Smart Estimate Builder v2
// AI-powered functions for material brand recommendations and upsell suggestions

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface MaterialBrandRecommendation {
  brand_name: string;
  brand_category: 'mid_range' | 'high_end' | 'premium';
  product_line?: string;
  warranty_years?: number;
  price_per_square_min: number;
  price_per_square_max: number;
  price_difference_percent: number;
  pros: string[];
  cons: string[];
  best_for: string;
  ai_reasoning: string;
  recommendation_score: number;
  is_recommended: boolean;
  region_suitability?: string[];
  weather_patterns?: string[];
}

export interface UpsellRecommendation {
  upsell_type: string;
  title: string;
  description: string;
  cost_min: number;
  cost_max: number;
  cost_avg: number;
  is_recommended: boolean;
  ai_reasoning: string;
  priority: number;
}

export interface EstimateSummary {
  summary_text: string;
  job_type_description: string;
  roof_size_description: string;
  material_description: string;
  duration_description: string;
  includes_description: string;
  warranty_info: string;
  price_range: string;
}

/**
 * Generate material brand recommendations based on region, weather, style, and preference
 */
export async function generateMaterialBrandRecommendations(
  region: string,
  state: string,
  weatherPatterns: string[],
  materialType: string,
  shingleType: string,
  roofSquares: number,
  preference: 'mid_range' | 'high_end' | 'premium' = 'mid_range'
): Promise<MaterialBrandRecommendation[]> {
  if (!process.env.OPENAI_API_KEY) {
    return getDefaultBrandRecommendations(materialType, preference);
  }

  try {
    const systemPrompt = `You are a roofing material expert. Recommend the best shingle brands for roofing projects based on region, weather patterns, and homeowner preferences.

Consider:
- Regional performance (wind resistance, algae resistance, hail resistance)
- Weather patterns (hurricanes, hail, high winds, extreme heat, heavy snow)
- Material quality and warranty
- Price point (mid-range, high-end, premium)
- Local building codes and insurance requirements

Return JSON array of 3-4 brand recommendations.`;

    const userPrompt = `Generate material brand recommendations for:
- Region: ${region}, State: ${state}
- Weather Patterns: ${weatherPatterns.join(', ')}
- Material Type: ${materialType}, Shingle Type: ${shingleType}
- Roof Size: ${roofSquares} squares
- Preference: ${preference}

Return JSON array with this structure:
[
  {
    "brand_name": "GAF Timberline HDZ",
    "brand_category": "mid_range",
    "product_line": "Timberline HDZ",
    "warranty_years": 50,
    "price_per_square_min": 320,
    "price_per_square_max": 380,
    "price_difference_percent": 0,
    "pros": ["Wind resistant", "Algae resistant", "Good warranty"],
    "cons": ["Higher cost than 3-tab"],
    "best_for": "High wind areas and coastal regions",
    "ai_reasoning": "Recommended for this region due to wind resistance...",
    "recommendation_score": 85,
    "is_recommended": true,
    "region_suitability": ["Southeast", "Gulf Coast"],
    "weather_patterns": ["hurricanes", "high_winds"]
  }
]`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return getDefaultBrandRecommendations(materialType, preference);
    }

    const parsed = JSON.parse(content);
    const brands = parsed.brands || parsed.recommendations || parsed;
    
    // Ensure it's an array
    const brandArray = Array.isArray(brands) ? brands : [brands];
    
    return brandArray.map((brand: any) => ({
      brand_name: brand.brand_name || brand.name || "Unknown",
      brand_category: brand.brand_category || preference,
      product_line: brand.product_line,
      warranty_years: brand.warranty_years || 30,
      price_per_square_min: brand.price_per_square_min || 300,
      price_per_square_max: brand.price_per_square_max || 400,
      price_difference_percent: brand.price_difference_percent || 0,
      pros: brand.pros || [],
      cons: brand.cons || [],
      best_for: brand.best_for || "General use",
      ai_reasoning: brand.ai_reasoning || brand.reasoning || "Recommended based on region and weather patterns",
      recommendation_score: brand.recommendation_score || 75,
      is_recommended: brand.is_recommended !== undefined ? brand.is_recommended : brand.recommendation_score >= 80,
      region_suitability: brand.region_suitability || [],
      weather_patterns: brand.weather_patterns || [],
    }));
  } catch (error) {
    console.error("Error generating brand recommendations:", error);
    return getDefaultBrandRecommendations(materialType, preference);
  }
}

/**
 * Generate upsell recommendations based on roof characteristics and homeowner needs
 */
export async function generateUpsellRecommendations(
  roofSquares: number,
  materialType: string,
  complexityRating: string,
  hasChimney: boolean,
  hasSkylights: boolean,
  hasValleys: boolean,
  region: string,
  state: string,
  isInsuranceJob: boolean
): Promise<UpsellRecommendation[]> {
  if (!process.env.OPENAI_API_KEY) {
    return getDefaultUpsellRecommendations(roofSquares, hasChimney, hasSkylights);
  }

  try {
    const systemPrompt = `You are a roofing sales expert. Recommend optional upsells that add value and increase ticket size while being genuinely helpful to homeowners.

Consider:
- Roof characteristics (size, complexity, features)
- Regional needs (ice & water shield in cold climates, algae resistance in humid areas)
- Insurance job opportunities (code upgrades, better materials)
- Homeowner value (energy efficiency, longevity, protection)

Return JSON array of 3-6 upsell recommendations.`;

    const userPrompt = `Generate upsell recommendations for:
- Roof Size: ${roofSquares} squares
- Material Type: ${materialType}
- Complexity: ${complexityRating}
- Has Chimney: ${hasChimney}
- Has Skylights: ${hasSkylights}
- Has Valleys: ${hasValleys}
- Region: ${region}, State: ${state}
- Insurance Job: ${isInsuranceJob}

Return JSON array with this structure:
[
  {
    "upsell_type": "ridge_vent_upgrade",
    "title": "Ridge Vent Upgrade",
    "description": "Improve attic ventilation with continuous ridge vent system",
    "cost_min": 800,
    "cost_max": 1200,
    "cost_avg": 1000,
    "is_recommended": true,
    "ai_reasoning": "Improves energy efficiency and extends roof life...",
    "priority": 5
  }
]`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return getDefaultUpsellRecommendations(roofSquares, hasChimney, hasSkylights);
    }

    const parsed = JSON.parse(content);
    const upsells = parsed.upsells || parsed.recommendations || parsed;
    
    // Ensure it's an array
    const upsellArray = Array.isArray(upsells) ? upsells : [upsells];
    
    return upsellArray.map((upsell: any) => ({
      upsell_type: upsell.upsell_type || upsell.type || "other",
      title: upsell.title || upsell.name || "Upsell Item",
      description: upsell.description || upsell.desc || "",
      cost_min: upsell.cost_min || 0,
      cost_max: upsell.cost_max || 0,
      cost_avg: upsell.cost_avg || (upsell.cost_min + upsell.cost_max) / 2,
      is_recommended: upsell.is_recommended !== undefined ? upsell.is_recommended : false,
      ai_reasoning: upsell.ai_reasoning || upsell.reasoning || "Recommended upgrade",
      priority: upsell.priority || 0,
    }));
  } catch (error) {
    console.error("Error generating upsell recommendations:", error);
    return getDefaultUpsellRecommendations(roofSquares, hasChimney, hasSkylights);
  }
}

/**
 * Generate customer-friendly estimate summary
 */
export async function generateEstimateSummary(
  jobType: string,
  roofSquaresMin: number,
  roofSquaresMax: number,
  materialType: string,
  jobDurationDaysMin: number,
  jobDurationDaysMax: number,
  priceMin: number,
  priceMax: number,
  includesItems: string[],
  hasWarranty: boolean
): Promise<EstimateSummary> {
  if (!process.env.OPENAI_API_KEY) {
    return getDefaultEstimateSummary(
      jobType,
      roofSquaresMin,
      roofSquaresMax,
      materialType,
      jobDurationDaysMin,
      jobDurationDaysMax,
      priceMin,
      priceMax,
      includesItems
    );
  }

  try {
    const systemPrompt = `You are a roofing communication expert. Create a clear, homeowner-friendly summary of a roofing estimate that helps homeowners understand what they're getting.

Make it:
- Clear and easy to understand (no technical jargon)
- Professional but friendly
- Focused on value and benefits
- Honest about scope and timeline`;

    const userPrompt = `Create a customer-friendly estimate summary for:
- Job Type: ${jobType}
- Roof Size: ${roofSquaresMin}-${roofSquaresMax} squares
- Material: ${materialType}
- Duration: ${jobDurationDaysMin}-${jobDurationDaysMax} days
- Price Range: $${priceMin.toLocaleString()} - $${priceMax.toLocaleString()}
- Includes: ${includesItems.join(', ')}
- Warranty Available: ${hasWarranty}

Return JSON with:
{
  "summary_text": "Full replacement recommended...",
  "job_type_description": "Full roof replacement",
  "roof_size_description": "Approx 18-22 squares",
  "material_description": "Architectural shingles",
  "duration_description": "1-2 days",
  "includes_description": "Includes drip edge & ridge vent",
  "warranty_info": "Warranty options available",
  "price_range": "$11,900-$18,400"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return getDefaultEstimateSummary(
        jobType,
        roofSquaresMin,
        roofSquaresMax,
        materialType,
        jobDurationDaysMin,
        jobDurationDaysMax,
        priceMin,
        priceMax,
        includesItems
      );
    }

    const parsed = JSON.parse(content);
    return {
      summary_text: parsed.summary_text || "",
      job_type_description: parsed.job_type_description || jobType.replace("_", " "),
      roof_size_description: parsed.roof_size_description || `${roofSquaresMin}-${roofSquaresMax} squares`,
      material_description: parsed.material_description || materialType,
      duration_description: parsed.duration_description || `${jobDurationDaysMin}-${jobDurationDaysMax} days`,
      includes_description: parsed.includes_description || includesItems.join(", "),
      warranty_info: parsed.warranty_info || (hasWarranty ? "Warranty options available" : ""),
      price_range: parsed.price_range || `$${priceMin.toLocaleString()}-$${priceMax.toLocaleString()}`,
    };
  } catch (error) {
    console.error("Error generating estimate summary:", error);
    return getDefaultEstimateSummary(
      jobType,
      roofSquaresMin,
      roofSquaresMax,
      materialType,
      jobDurationDaysMin,
      jobDurationDaysMax,
      priceMin,
      priceMax,
      includesItems
    );
  }
}

/**
 * Generate SMS-friendly estimate text
 */
export function generateSMSEstimate(
  roofSquaresMin: number,
  roofSquaresMax: number,
  priceMin: number,
  priceMax: number,
  jobType: string
): string {
  const squares = roofSquaresMin === roofSquaresMax 
    ? `${roofSquaresMin}` 
    : `${roofSquaresMin}-${roofSquaresMax}`;
  
  const priceRange = `$${(priceMin / 1000).toFixed(1)}k-$${(priceMax / 1000).toFixed(1)}k`;
  
  const jobTypeText = jobType === 'roof_replacement' 
    ? 'full replacement' 
    : jobType.replace('_', ' ');
  
  return `Your roof appears to be ${squares} squares. Estimated ${jobTypeText} is ${priceRange}. We can inspect tomorrow at 10 AM.`;
}

// Default fallback functions

function getDefaultBrandRecommendations(
  materialType: string,
  preference: 'mid_range' | 'high_end' | 'premium'
): MaterialBrandRecommendation[] {
  const brands: MaterialBrandRecommendation[] = [
    {
      brand_name: "GAF Timberline HDZ",
      brand_category: "mid_range",
      product_line: "Timberline HDZ",
      warranty_years: 50,
      price_per_square_min: 320,
      price_per_square_max: 380,
      price_difference_percent: 0,
      pros: ["Wind resistant", "Algae resistant", "Good warranty"],
      cons: ["Higher cost than 3-tab"],
      best_for: "High wind areas and coastal regions",
      ai_reasoning: "Popular mid-range option with excellent wind resistance",
      recommendation_score: 85,
      is_recommended: true,
      region_suitability: ["Southeast", "Gulf Coast"],
      weather_patterns: ["hurricanes", "high_winds"],
    },
    {
      brand_name: "CertainTeed Landmark",
      brand_category: "mid_range",
      product_line: "Landmark",
      warranty_years: 50,
      price_per_square_min: 330,
      price_per_square_max: 390,
      price_difference_percent: 3,
      pros: ["Durable", "Good color options", "Reliable"],
      cons: ["Slightly more expensive"],
      best_for: "General use in most climates",
      ai_reasoning: "Reliable mid-range option with good durability",
      recommendation_score: 80,
      is_recommended: false,
      region_suitability: ["Northeast", "Midwest"],
      weather_patterns: ["snow", "rain"],
    },
  ];

  if (preference === 'high_end' || preference === 'premium') {
    brands.push({
      brand_name: "Malarkey Highlander",
      brand_category: "high_end",
      product_line: "Highlander",
      warranty_years: 50,
      price_per_square_min: 380,
      price_per_square_max: 450,
      price_difference_percent: 20,
      pros: ["Premium quality", "Excellent warranty", "Superior protection"],
      cons: ["Higher cost"],
      best_for: "Premium homes requiring best protection",
      ai_reasoning: "Premium option with superior quality and protection",
      recommendation_score: 90,
      is_recommended: preference === 'premium',
      region_suitability: ["All regions"],
      weather_patterns: ["all"],
    });
  }

  return brands;
}

function getDefaultUpsellRecommendations(
  roofSquares: number,
  hasChimney: boolean,
  hasSkylights: boolean
): UpsellRecommendation[] {
  const upsells: UpsellRecommendation[] = [
    {
      upsell_type: "ridge_vent_upgrade",
      title: "Ridge Vent Upgrade",
      description: "Improve attic ventilation with continuous ridge vent system",
      cost_min: 800,
      cost_max: 1200,
      cost_avg: 1000,
      is_recommended: true,
      ai_reasoning: "Improves energy efficiency and extends roof life",
      priority: 5,
    },
    {
      upsell_type: "ice_water_full_coverage",
      title: "Full Ice & Water Shield Coverage",
      description: "Upgrade to full ice & water shield coverage for maximum protection",
      cost_min: roofSquares * 50,
      cost_max: roofSquares * 75,
      cost_avg: roofSquares * 62.5,
      is_recommended: false,
      ai_reasoning: "Provides superior protection in cold climates",
      priority: 3,
    },
    {
      upsell_type: "synthetic_underlayment_upgrade",
      title: "Synthetic Underlayment Upgrade",
      description: "Upgrade to premium synthetic underlayment for better protection",
      cost_min: roofSquares * 30,
      cost_max: roofSquares * 50,
      cost_avg: roofSquares * 40,
      is_recommended: true,
      ai_reasoning: "Better protection and longer-lasting than felt",
      priority: 4,
    },
  ];

  if (hasChimney) {
    upsells.push({
      upsell_type: "chimney_cap",
      title: "Chimney Cap Installation",
      description: "Install chimney cap to prevent water and debris entry",
      cost_min: 200,
      cost_max: 400,
      cost_avg: 300,
      is_recommended: true,
      ai_reasoning: "Prevents water damage and extends chimney life",
      priority: 4,
    });
  }

  if (hasSkylights) {
    upsells.push({
      upsell_type: "skylight_upgrade",
      title: "Skylight Seal Upgrade",
      description: "Upgrade skylight seals and flashing for better protection",
      cost_min: 300,
      cost_max: 600,
      cost_avg: 450,
      is_recommended: false,
      ai_reasoning: "Prevents leaks around skylights",
      priority: 2,
    });
  }

  return upsells;
}

function getDefaultEstimateSummary(
  jobType: string,
  roofSquaresMin: number,
  roofSquaresMax: number,
  materialType: string,
  jobDurationDaysMin: number,
  jobDurationDaysMax: number,
  priceMin: number,
  priceMax: number,
  includesItems: string[]
): EstimateSummary {
  const jobTypeText = jobType === 'roof_replacement' 
    ? 'Full replacement recommended' 
    : jobType.replace('_', ' ');
  
  return {
    summary_text: `${jobTypeText}. Approx ${roofSquaresMin}-${roofSquaresMax} squares. Material: ${materialType}. Job duration: ${jobDurationDaysMin}-${jobDurationDaysMax} days. Includes ${includesItems.join(' & ')}. Warranty options available. Estimated investment: $${priceMin.toLocaleString()}-$${priceMax.toLocaleString()}.`,
    job_type_description: jobTypeText,
    roof_size_description: `Approx ${roofSquaresMin}-${roofSquaresMax} squares`,
    material_description: materialType,
    duration_description: `${jobDurationDaysMin}-${jobDurationDaysMax} days`,
    includes_description: `Includes ${includesItems.join(' & ')}`,
    warranty_info: "Warranty options available",
    price_range: `$${priceMin.toLocaleString()}-$${priceMax.toLocaleString()}`,
  };
}



















































