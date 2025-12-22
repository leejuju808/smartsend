/**
 * Block 255000 — AI Damage Probability Calculator
 * Calculates damage probability for properties based on storm and property characteristics
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface PropertyData {
  customerId?: string;
  leadId?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  roofAge?: number;
  roofType?: string;
  roofPitch?: number;
  roofSquares?: number;
  homeValue?: number;
  sidingType?: string;
  gutterType?: string;
  propertyAge?: number;
}

export interface StormData {
  stormType: 'hail' | 'wind' | 'tornado' | 'heavy_rain' | 'snow' | 'ice';
  severity: 'light' | 'moderate' | 'severe' | 'extreme';
  hailSize?: number;
  windSpeed?: number;
  rainfall?: number;
  distanceFromCenter?: number; // miles from storm center
}

export interface DamagePrediction {
  probability: number; // 0-1
  zone: 'red' | 'yellow' | 'green';
  predictedDamage: string[];
  riskFactors: {
    hail_size?: number;
    wind_speed?: number;
    roof_age?: number;
    roof_type?: string;
    roof_pitch?: number;
    home_value?: number;
    siding_exposure?: string;
    gutter_exposure?: string;
    distance_factor?: number;
  };
}

/**
 * Calculate damage probability for a property
 */
export function calculateDamageProbability(
  property: PropertyData,
  storm: StormData
): DamagePrediction {
  let probability = 0;
  const riskFactors: DamagePrediction['riskFactors'] = {};
  const predictedDamage: string[] = [];

  // Base probability from storm severity
  const baseProbability = getBaseProbability(storm);
  probability += baseProbability * 0.4; // 40% weight

  // Distance factor (closer = higher risk)
  const distanceFactor = storm.distanceFromCenter 
    ? Math.max(0, 1 - (storm.distanceFromCenter / 20)) // Linear decay over 20 miles
    : 0.5; // Default if unknown
  riskFactors.distance_factor = distanceFactor;
  probability += distanceFactor * 0.2; // 20% weight

  // Roof age factor
  if (property.roofAge !== undefined) {
    const roofAgeFactor = Math.min(1, property.roofAge / 25); // Older = higher risk
    riskFactors.roof_age = property.roofAge;
    probability += roofAgeFactor * 0.15; // 15% weight
    if (property.roofAge > 15) {
      predictedDamage.push('shingles');
    }
  }

  // Roof type factor
  if (property.roofType) {
    const roofTypeFactor = getRoofTypeRisk(property.roofType, storm.stormType);
    riskFactors.roof_type = property.roofType;
    probability += roofTypeFactor * 0.1; // 10% weight
  }

  // Roof pitch factor (steeper = less wind damage, more hail impact)
  if (property.roofPitch !== undefined) {
    riskFactors.roof_pitch = property.roofPitch;
    if (storm.stormType === 'wind') {
      // Steeper roofs are more wind-resistant
      const pitchFactor = Math.max(0, 1 - (property.roofPitch / 12));
      probability += pitchFactor * 0.05;
    } else if (storm.stormType === 'hail') {
      // Steeper roofs get more direct hail impact
      const pitchFactor = Math.min(1, property.roofPitch / 12);
      probability += pitchFactor * 0.05;
    }
  }

  // Home value factor (proxy for quality of materials/construction)
  if (property.homeValue) {
    riskFactors.home_value = property.homeValue;
    // Lower value homes often have older/cheaper materials
    const valueFactor = property.homeValue < 200000 ? 0.1 : 0;
    probability += valueFactor * 0.05;
  }

  // Siding exposure (for wind/hail)
  if (property.sidingType) {
    const sidingExposure = getSidingExposure(property.sidingType, storm);
    riskFactors.siding_exposure = sidingExposure;
    if (sidingExposure === 'high') {
      probability += 0.05;
      predictedDamage.push('siding');
    }
  }

  // Gutter exposure
  if (property.gutterType) {
    const gutterExposure = getGutterExposure(property.gutterType, storm);
    riskFactors.gutter_exposure = gutterExposure;
    if (gutterExposure === 'high') {
      probability += 0.05;
      predictedDamage.push('gutters');
    }
  }

  // Storm-specific adjustments
  if (storm.stormType === 'hail' && storm.hailSize) {
    riskFactors.hail_size = storm.hailSize;
    if (storm.hailSize >= 1.5) {
      probability += 0.15;
      predictedDamage.push('shingles', 'gutters', 'siding');
    } else if (storm.hailSize >= 1.0) {
      probability += 0.10;
      predictedDamage.push('shingles', 'gutters');
    }
  }

  if (storm.stormType === 'wind' && storm.windSpeed) {
    riskFactors.wind_speed = storm.windSpeed;
    if (storm.windSpeed >= 70) {
      probability += 0.20;
      predictedDamage.push('shingles', 'gutters', 'siding', 'flashing');
    } else if (storm.windSpeed >= 60) {
      probability += 0.15;
      predictedDamage.push('shingles', 'gutters');
    }
  }

  // Cap at 1.0
  probability = Math.min(1.0, probability);

  // Determine zone
  let zone: 'red' | 'yellow' | 'green';
  if (probability >= 0.70) {
    zone = 'red';
  } else if (probability >= 0.40) {
    zone = 'yellow';
  } else {
    zone = 'green';
  }

  // Default predicted damage if none specified
  if (predictedDamage.length === 0) {
    predictedDamage.push('potential_damage');
  }

  return {
    probability,
    zone,
    predictedDamage: [...new Set(predictedDamage)], // Remove duplicates
    riskFactors
  };
}

/**
 * Get base probability from storm severity
 */
function getBaseProbability(storm: StormData): number {
  switch (storm.severity) {
    case 'extreme': return 0.80;
    case 'severe': return 0.60;
    case 'moderate': return 0.40;
    case 'light': return 0.20;
    default: return 0.30;
  }
}

/**
 * Get roof type risk factor
 */
function getRoofTypeRisk(roofType: string, stormType: string): number {
  const normalizedType = roofType.toLowerCase();
  
  if (stormType === 'hail') {
    // Asphalt shingles are most vulnerable to hail
    if (normalizedType.includes('asphalt') || normalizedType.includes('shingle')) return 0.8;
    if (normalizedType.includes('metal')) return 0.4;
    if (normalizedType.includes('tile') || normalizedType.includes('slate')) return 0.3;
    if (normalizedType.includes('rubber') || normalizedType.includes('tpo')) return 0.5;
  }
  
  if (stormType === 'wind') {
    // Metal and tile are more wind-resistant
    if (normalizedType.includes('metal')) return 0.3;
    if (normalizedType.includes('tile') || normalizedType.includes('slate')) return 0.4;
    if (normalizedType.includes('asphalt') || normalizedType.includes('shingle')) return 0.7;
  }
  
  // Default moderate risk
  return 0.5;
}

/**
 * Get siding exposure level
 */
function getSidingExposure(sidingType: string, storm: StormData): 'low' | 'medium' | 'high' {
  const normalized = sidingType.toLowerCase();
  
  if (storm.stormType === 'hail' && storm.hailSize && storm.hailSize >= 1.0) {
    if (normalized.includes('vinyl')) return 'high';
    if (normalized.includes('aluminum')) return 'high';
    if (normalized.includes('fiber cement') || normalized.includes('hardie')) return 'medium';
    if (normalized.includes('brick') || normalized.includes('stone')) return 'low';
  }
  
  if (storm.stormType === 'wind' && storm.windSpeed && storm.windSpeed >= 60) {
    if (normalized.includes('vinyl')) return 'high';
    if (normalized.includes('aluminum')) return 'medium';
    return 'low';
  }
  
  return 'medium';
}

/**
 * Get gutter exposure level
 */
function getGutterExposure(gutterType: string, storm: StormData): 'low' | 'medium' | 'high' {
  if (storm.stormType === 'hail' && storm.hailSize && storm.hailSize >= 1.0) {
    return 'high'; // Gutters are always exposed to hail
  }
  
  if (storm.stormType === 'wind' && storm.windSpeed && storm.windSpeed >= 60) {
    return 'high'; // High winds can damage gutters
  }
  
  return 'medium';
}

/**
 * Create damage prediction record in database
 */
export async function createDamagePrediction(
  stormId: string,
  teamId: string,
  property: PropertyData,
  prediction: DamagePrediction
): Promise<{ id: string; error?: any }> {
  const { data, error } = await supabase
    .from('storm_damage_predictions')
    .insert({
      storm_id: stormId,
      team_id: teamId,
      customer_id: property.customerId || null,
      lead_id: property.leadId || null,
      property_address: property.address,
      property_latitude: property.latitude,
      property_longitude: property.longitude,
      probability: prediction.probability,
      predicted_damage: prediction.predictedDamage,
      risk_factors: prediction.riskFactors,
      zone: prediction.zone
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating damage prediction:', error);
    return { id: '', error };
  }

  return { id: data.id };
}

/**
 * Batch create damage predictions for multiple properties
 */
export async function batchCreateDamagePredictions(
  stormId: string,
  teamId: string,
  properties: Array<{ property: PropertyData; storm: StormData }>
): Promise<{ created: number; errors: number }> {
  let created = 0;
  let errors = 0;

  for (const { property, storm } of properties) {
    const prediction = calculateDamageProbability(property, storm);
    const result = await createDamagePrediction(stormId, teamId, property, prediction);
    
    if (result.error) {
      errors++;
    } else {
      created++;
    }
  }

  return { created, errors };
}






















