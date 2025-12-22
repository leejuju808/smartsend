// Block 18900 — SmartSend Roof Age Verifier v1
// Confidence-Based Roof Age Detection Using Home Data, Photos, Neighborhood Patterns, Storm History & Homeowner Language

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export interface RoofAgeSource {
  sourceType: 'home_build_year' | 'sale_history' | 'neighborhood_pattern' | 'storm_history' | 'homeowner_language' | 'photo_intelligence';
  ageEstimateMin: number | null;
  ageEstimateMax: number | null;
  ageEstimateMedian: number | null;
  sourceWeight: number; // 0-100
  sourceConfidence: number; // 0-100
  sourceData: Record<string, any>;
}

export interface RoofAgeResult {
  estimatedAgeMin: number;
  estimatedAgeMax: number;
  estimatedAgeMedian: number;
  confidenceScore: number; // 0-100
  ageBand: '0_7_years' | '8_15_years' | '16_25_years' | '25_plus_years' | 'unknown';
  replacementProbability: number; // 0-100
  insuranceFeasibility: 'high' | 'moderate' | 'low' | 'unknown';
  materialConfirmed: string | null;
  stormImpact: 'wind_hail' | 'wind_only' | 'hail_only' | 'none' | 'unknown';
  recommendedAction: string;
  reasoningSummary: {
    sources: string[];
    keyFactors: string[];
    confidenceFactors: string[];
  };
  sources: RoofAgeSource[];
}

/**
 * Calculate roof age from home build year
 * If house built in 2006 → roof likely 18 years old unless replaced
 */
async function getHomeBuildYearSource(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string,
  contact: any
): Promise<RoofAgeSource | null> {
  // Check if we have home build year in contact enrichment or contact data
  // For now, we'll check contact_enrichment and contacts table
  const currentYear = new Date().getFullYear();
  
  // Try to get home build year from various sources
  // This would typically come from property data APIs or enrichment
  // For now, we'll check if there's a home_build_year field
  
  // If we have home build year, calculate roof age
  // Assume roof age = current year - build year (unless replaced)
  // This is a baseline estimate
  
  // For v1, we'll return null if no build year data
  // In production, this would query property data APIs
  
  return null; // Placeholder - would integrate with property data
}

/**
 * Analyze sale history for roof replacement clues
 * Many roofs get replaced BEFORE sale
 */
async function getSaleHistorySource(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string,
  contact: any
): Promise<RoofAgeSource | null> {
  // Check for sale history data
  // Look for:
  // - sale year
  // - listing description text ("new roof", "recently replaced")
  // - home photos from listing
  // - neighborhood comps
  
  // For v1, we'll check if there's sale data in contact enrichment
  // In production, this would query MLS data or property APIs
  
  return null; // Placeholder
}

/**
 * Get neighborhood roof age pattern
 * If homes on that block all show roofs replaced around 2015 → use that pattern
 */
async function getNeighborhoodPatternSource(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string,
  contact: any,
  workspaceId: string
): Promise<RoofAgeSource | null> {
  if (!contact.zip) {
    return null;
  }

  try {
    // Get neighborhood/ZIP roof age data
    const { data: zipData } = await supabase
      .from('geo_zip_data')
      .select('avg_roof_age, median_roof_age, old_roof_pct')
      .eq('workspace_id', workspaceId)
      .eq('zip', contact.zip)
      .single();

    if (!zipData?.avg_roof_age) {
      return null;
    }

    const avgAge = Number(zipData.avg_roof_age);
    const medianAge = Number(zipData.median_roof_age) || avgAge;

    // Neighborhood pattern gets moderate weight (20-30%)
    // Confidence depends on how many homes in the area
    const confidence = zipData.old_roof_pct ? Math.min(75, 40 + Number(zipData.old_roof_pct)) : 50;

    return {
      sourceType: 'neighborhood_pattern',
      ageEstimateMin: Math.max(0, Math.floor(avgAge - 3)),
      ageEstimateMax: Math.floor(avgAge + 3),
      ageEstimateMedian: medianAge,
      sourceWeight: 25,
      sourceConfidence: confidence,
      sourceData: {
        zip: contact.zip,
        avgRoofAge: avgAge,
        medianRoofAge: medianAge,
        oldRoofPct: zipData.old_roof_pct,
      },
    };
  } catch (error) {
    console.error('Error getting neighborhood pattern:', error);
    return null;
  }
}

/**
 * Analyze storm history patterns
 * If major hail storms hit in 2010, 2014, 2018, 2022 → homeowners often replaced after each storm
 */
async function getStormHistorySource(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string,
  contact: any,
  workspaceId: string
): Promise<RoofAgeSource | null> {
  if (!contact.zip) {
    return null;
  }

  try {
    // Get storm events for this ZIP
    const { data: stormEvents } = await supabase
      .from('weather_events')
      .select('storm_type, storm_started_at, hail_size, wind_speed, storm_intensity_score')
      .eq('workspace_id', workspaceId)
      .eq('zip', contact.zip)
      .gte('storm_intensity_score', 60) // Only significant storms
      .order('storm_started_at', { ascending: false })
      .limit(10);

    if (!stormEvents || stormEvents.length === 0) {
      return null;
    }

    // Analyze storm patterns
    // If storms occurred in cycles (e.g., every 4 years), roofs likely replaced after each
    const currentYear = new Date().getFullYear();
    const stormYears = stormEvents.map(e => new Date(e.storm_started_at).getFullYear());
    
    // Find most recent significant storm
    const mostRecentStormYear = Math.max(...stormYears);
    const yearsSinceStorm = currentYear - mostRecentStormYear;

    // If storm was recent (< 2 years), roof might be newer (replaced after storm)
    // If storm was older (> 5 years), roof might be older (not replaced)
    let ageEstimate: number;
    let confidence: number;

    if (yearsSinceStorm <= 2) {
      // Recent storm - roof likely replaced after storm (0-2 years old)
      ageEstimate = yearsSinceStorm;
      confidence = 60;
    } else if (yearsSinceStorm <= 5) {
      // Medium storm - roof might be 3-7 years old
      ageEstimate = yearsSinceStorm;
      confidence = 50;
    } else {
      // Old storm - roof likely not replaced, use storm year as baseline
      // Assume roof was 10-15 years old at time of storm
      ageEstimate = yearsSinceStorm + 12; // 12 years old at storm + years since
      confidence = 40;
    }

    return {
      sourceType: 'storm_history',
      ageEstimateMin: Math.max(0, Math.floor(ageEstimate - 2)),
      ageEstimateMax: Math.floor(ageEstimate + 5),
      ageEstimateMedian: ageEstimate,
      sourceWeight: 20,
      sourceConfidence: confidence,
      sourceData: {
        stormYears,
        mostRecentStormYear,
        yearsSinceStorm,
        stormCount: stormEvents.length,
        avgIntensity: stormEvents.reduce((sum, e) => sum + (e.storm_intensity_score || 0), 0) / stormEvents.length,
      },
    };
  } catch (error) {
    console.error('Error getting storm history:', error);
    return null;
  }
}

/**
 * Analyze homeowner language clues
 * "Roof is original" → roof age = home age
 * "Long time" → 15–20 years
 * "I don't remember" → 10–15 years
 */
async function getHomeownerLanguageSource(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string
): Promise<RoofAgeSource | null> {
  try {
    // Get recent messages/replies from this contact
    const { data: messages } = await supabase
      .from('normalized_messages')
      .select('body, sent_at')
      .eq('contact_id', contactId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(20);

    if (!messages || messages.length === 0) {
      return null;
    }

    // Analyze language patterns
    const text = messages.map(m => m.body || '').join(' ').toLowerCase();
    
    let ageEstimate: number | null = null;
    let confidence = 30; // Low confidence for language analysis
    const detectedPhrases: string[] = [];

    // Language patterns
    if (text.includes('original roof') || text.includes('roof is original')) {
      // Would need home age - for now, estimate 15-25 years
      ageEstimate = 20;
      confidence = 50;
      detectedPhrases.push('original roof');
    } else if (text.includes('long time') || text.includes('been a while') || text.includes('years ago')) {
      ageEstimate = 17;
      confidence = 40;
      detectedPhrases.push('long time');
    } else if (text.includes("don't remember") || text.includes('not sure') || text.includes('forgot')) {
      ageEstimate = 12;
      confidence = 30;
      detectedPhrases.push('uncertain');
    } else if (text.includes('bought house') || text.includes('purchased')) {
      // Extract year if possible
      const yearMatch = text.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        const purchaseYear = parseInt(yearMatch[0]);
        const currentYear = new Date().getFullYear();
        ageEstimate = currentYear - purchaseYear;
        confidence = 45;
        detectedPhrases.push(`bought in ${purchaseYear}`);
      }
    } else if (text.includes('previous owner') || text.includes('previous owner replaced')) {
      ageEstimate = 9;
      confidence = 35;
      detectedPhrases.push('previous owner');
    } else if (text.includes('new roof') || text.includes('recently replaced') || text.includes('just replaced')) {
      ageEstimate = 2;
      confidence = 60;
      detectedPhrases.push('new roof');
    }

    if (ageEstimate === null) {
      return null;
    }

    return {
      sourceType: 'homeowner_language',
      ageEstimateMin: Math.max(0, Math.floor(ageEstimate - 3)),
      ageEstimateMax: Math.floor(ageEstimate + 5),
      ageEstimateMedian: ageEstimate,
      sourceWeight: 15,
      sourceConfidence: confidence,
      sourceData: {
        detectedPhrases,
        messageCount: messages.length,
      },
    };
  } catch (error) {
    console.error('Error analyzing homeowner language:', error);
    return null;
  }
}

/**
 * Get photo intelligence roof age estimate
 * Uses photo analysis from Block 18500
 */
async function getPhotoIntelligenceSource(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string
): Promise<RoofAgeSource | null> {
  try {
    // Get photo analysis results
    // Check photo_intelligence table or photo analysis results
    const { data: photos } = await supabase
      .from('photo_intelligence')
      .select('roof_age_estimate, material_type, granule_loss, curling, cracking, confidence')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!photos || photos.length === 0) {
      return null;
    }

    // Use most recent photo with highest confidence
    const bestPhoto = photos.reduce((best, photo) => {
      if (!best || (photo.confidence || 0) > (best.confidence || 0)) {
        return photo;
      }
      return best;
    });

    if (!bestPhoto.roof_age_estimate) {
      return null;
    }

    // Map photo age estimate to years
    const ageMap: Record<string, number> = {
      '0_5_years': 2.5,
      '6_15_years': 10.5,
      '16_25_years': 20.5,
      '25_plus_years': 30,
    };

    const ageEstimate = ageMap[bestPhoto.roof_age_estimate] || 15;
    const photoConfidence = bestPhoto.confidence || 50;

    return {
      sourceType: 'photo_intelligence',
      ageEstimateMin: Math.max(0, Math.floor(ageEstimate - 3)),
      ageEstimateMax: Math.floor(ageEstimate + 5),
      ageEstimateMedian: ageEstimate,
      sourceWeight: 30, // Photo intelligence gets high weight
      sourceConfidence: photoConfidence,
      sourceData: {
        roofAgeEstimate: bestPhoto.roof_age_estimate,
        materialType: bestPhoto.material_type,
        granuleLoss: bestPhoto.granule_loss,
        curling: bestPhoto.curling,
        cracking: bestPhoto.cracking,
        photoCount: photos.length,
      },
    };
  } catch (error) {
    console.error('Error getting photo intelligence:', error);
    return null;
  }
}

/**
 * Calculate roof age from all sources using weighted average
 */
function calculateRoofAge(sources: RoofAgeSource[]): RoofAgeResult {
  // Filter out null sources and inactive sources
  const activeSources = sources.filter(s => s !== null && s.ageEstimateMedian !== null);

  if (activeSources.length === 0) {
    return {
      estimatedAgeMin: 0,
      estimatedAgeMax: 25,
      estimatedAgeMedian: 15,
      confidenceScore: 0,
      ageBand: 'unknown',
      replacementProbability: 0,
      insuranceFeasibility: 'unknown',
      materialConfirmed: null,
      stormImpact: 'unknown',
      recommendedAction: 'full_assessment',
      reasoningSummary: {
        sources: [],
        keyFactors: ['No data sources available'],
        confidenceFactors: ['Insufficient data'],
      },
      sources: [],
    };
  }

  // Calculate weighted average
  let totalWeight = 0;
  let weightedSum = 0;
  let maxConfidence = 0;
  let minAge = Infinity;
  let maxAge = -Infinity;

  const sourceContributions: string[] = [];
  const keyFactors: string[] = [];
  const confidenceFactors: string[] = [];

  for (const source of activeSources) {
    const weight = source.sourceWeight * (source.sourceConfidence / 100);
    totalWeight += weight;
    weightedSum += (source.ageEstimateMedian || 0) * weight;
    
    maxConfidence = Math.max(maxConfidence, source.sourceConfidence);
    minAge = Math.min(minAge, source.ageEstimateMin || 0);
    maxAge = Math.max(maxAge, source.ageEstimateMax || 0);

    sourceContributions.push(`${source.sourceType} (${source.ageEstimateMedian?.toFixed(1)} years, ${source.sourceConfidence}% confidence)`);
    
    if (source.sourceConfidence >= 60) {
      keyFactors.push(`${source.sourceType} indicates ${source.ageEstimateMedian?.toFixed(1)} years`);
    }
    
    if (source.sourceConfidence >= 70) {
      confidenceFactors.push(`High confidence ${source.sourceType} data`);
    }
  }

  const estimatedAgeMedian = totalWeight > 0 ? weightedSum / totalWeight : 15;
  
  // Calculate overall confidence
  // Base confidence on number of sources and their individual confidences
  const avgConfidence = activeSources.reduce((sum, s) => sum + s.sourceConfidence, 0) / activeSources.length;
  const sourceCountBonus = Math.min(20, activeSources.length * 5); // Up to 20 points for multiple sources
  const confidenceScore = Math.min(100, Math.round(avgConfidence * 0.7 + sourceCountBonus));

  // Determine age band
  let ageBand: '0_7_years' | '8_15_years' | '16_25_years' | '25_plus_years' | 'unknown';
  if (estimatedAgeMedian <= 7) {
    ageBand = '0_7_years';
  } else if (estimatedAgeMedian <= 15) {
    ageBand = '8_15_years';
  } else if (estimatedAgeMedian <= 25) {
    ageBand = '16_25_years';
  } else {
    ageBand = '25_plus_years';
  }

  // Calculate replacement probability
  let replacementProbability: number;
  if (estimatedAgeMedian <= 7) {
    replacementProbability = 10;
  } else if (estimatedAgeMedian <= 15) {
    replacementProbability = 40;
  } else if (estimatedAgeMedian <= 25) {
    replacementProbability = 85;
  } else {
    replacementProbability = 95;
  }

  // Determine insurance feasibility
  let insuranceFeasibility: 'high' | 'moderate' | 'low' | 'unknown';
  if (estimatedAgeMedian < 10) {
    insuranceFeasibility = 'high';
  } else if (estimatedAgeMedian < 20) {
    insuranceFeasibility = 'moderate';
  } else {
    insuranceFeasibility = 'low';
  }

  // Get material from photo intelligence if available
  const photoSource = activeSources.find(s => s.sourceType === 'photo_intelligence');
  const materialConfirmed = photoSource?.sourceData?.materialType || null;

  // Determine storm impact
  const stormSource = activeSources.find(s => s.sourceType === 'storm_history');
  let stormImpact: 'wind_hail' | 'wind_only' | 'hail_only' | 'none' | 'unknown' = 'unknown';
  if (stormSource) {
    const stormData = stormSource.sourceData;
    if (stormData.hailSize && stormData.windSpeed) {
      stormImpact = 'wind_hail';
    } else if (stormData.hailSize) {
      stormImpact = 'hail_only';
    } else if (stormData.windSpeed) {
      stormImpact = 'wind_only';
    }
  }

  // Determine recommended action
  let recommendedAction: string;
  if (estimatedAgeMedian <= 10) {
    recommendedAction = stormImpact !== 'none' && stormImpact !== 'unknown' ? 'storm_inspection' : 'repair_only';
  } else if (estimatedAgeMedian <= 17) {
    recommendedAction = 'full_assessment';
  } else if (estimatedAgeMedian <= 25) {
    recommendedAction = 'replacement_appointment';
  } else {
    recommendedAction = 'emergency_replacement';
  }

  return {
    estimatedAgeMin: Math.max(0, Math.floor(minAge)),
    estimatedAgeMax: Math.floor(maxAge),
    estimatedAgeMedian: Math.round(estimatedAgeMedian * 10) / 10,
    confidenceScore,
    ageBand,
    replacementProbability,
    insuranceFeasibility,
    materialConfirmed,
    stormImpact,
    recommendedAction,
    reasoningSummary: {
      sources: sourceContributions,
      keyFactors: keyFactors.length > 0 ? keyFactors : ['Multiple data sources analyzed'],
      confidenceFactors: confidenceFactors.length > 0 ? confidenceFactors : [`${activeSources.length} source(s) analyzed`],
    },
    sources: activeSources,
  };
}

/**
 * Main function: Calculate roof age for a contact
 */
export async function calculateRoofAgeForContact(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string,
  workspaceId: string
): Promise<RoofAgeResult> {
  // Get contact data
  const { data: contact, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single();

  if (error || !contact) {
    throw new Error('Contact not found');
  }

  // Gather all sources
  const sources: RoofAgeSource[] = [];

  // 1. Home Build Year
  const buildYearSource = await getHomeBuildYearSource(supabase, contactId, contact);
  if (buildYearSource) sources.push(buildYearSource);

  // 2. Sale History
  const saleHistorySource = await getSaleHistorySource(supabase, contactId, contact);
  if (saleHistorySource) sources.push(saleHistorySource);

  // 3. Neighborhood Pattern
  const neighborhoodSource = await getNeighborhoodPatternSource(supabase, contactId, contact, workspaceId);
  if (neighborhoodSource) sources.push(neighborhoodSource);

  // 4. Storm History
  const stormSource = await getStormHistorySource(supabase, contactId, contact, workspaceId);
  if (stormSource) sources.push(stormSource);

  // 5. Homeowner Language
  const languageSource = await getHomeownerLanguageSource(supabase, contactId);
  if (languageSource) sources.push(languageSource);

  // 6. Photo Intelligence
  const photoSource = await getPhotoIntelligenceSource(supabase, contactId);
  if (photoSource) sources.push(photoSource);

  // Calculate final roof age
  const result = calculateRoofAge(sources);

  return result;
}





















































