/**
 * Block 255000 — Storm Lead Generator
 * Generates new leads from geo-targeting in storm-affected areas
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface GeoTargetedLead {
  name?: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  homeValue?: number;
  propertyAge?: number;
}

/**
 * Generate storm leads from geo-targeting
 * This would integrate with public records APIs, GIS data, etc.
 */
export async function generateStormLeads(
  stormId: string,
  teamId: string,
  affectedZips: string[]
): Promise<{ created: number; errors: number }> {
  let created = 0;
  let errors = 0;

  // Fetch storm data
  const { data: storm } = await supabase
    .from('storm_events')
    .select('id, storm_type, severity, affected_zips, center_latitude, center_longitude')
    .eq('id', stormId)
    .single();

  if (!storm) {
    return { created: 0, errors: 0 };
  }

  // For each affected ZIP, generate leads
  for (const zip of affectedZips) {
    try {
      // In production, this would:
      // 1. Query public records API for homeowners in ZIP
      // 2. Filter out existing customers/leads
      // 3. Enrich with property data
      // 4. Create storm leads

      const leads = await fetchLeadsForZip(zip, teamId, storm);

      for (const lead of leads) {
        try {
          // Check if already exists
          const { data: existing } = await supabase
            .from('storm_leads')
            .select('id')
            .eq('storm_id', stormId)
            .eq('team_id', teamId)
            .or(`address.eq.${lead.address},phone.eq.${lead.phone},email.eq.${lead.email}`)
            .maybeSingle();

          if (existing) {
            continue; // Skip duplicates
          }

          // Create storm lead
          const { error } = await supabase
            .from('storm_leads')
            .insert({
              storm_id: stormId,
              team_id: teamId,
              source: 'geo_targeted',
              homeowner_name: lead.name,
              address: lead.address,
              city: lead.city,
              state: lead.state,
              zip_code: lead.zipCode,
              phone: lead.phone,
              email: lead.email,
              status: 'new'
            });

          if (error) {
            console.error(`Error creating storm lead for ${lead.address}:`, error);
            errors++;
          } else {
            created++;
          }
        } catch (error) {
          console.error(`Error processing lead ${lead.address}:`, error);
          errors++;
        }
      }
    } catch (error) {
      console.error(`Error generating leads for ZIP ${zip}:`, error);
      errors++;
    }
  }

  return { created, errors };
}

/**
 * Fetch leads for a specific ZIP code
 * In production, this would integrate with:
 * - Public records APIs (PropertyRadar, CoreLogic, etc.)
 * - GIS mapping services
 * - Real estate APIs
 * - County assessor databases
 */
async function fetchLeadsForZip(
  zip: string,
  teamId: string,
  storm: any
): Promise<GeoTargetedLead[]> {
  // TODO: Integrate with actual data sources
  // For now, return empty array - this would be implemented with real APIs
  
  // Example integration points:
  // 1. PropertyRadar API: https://api.propertyradar.com
  // 2. CoreLogic API
  // 3. County assessor databases
  // 4. Real estate APIs (Zillow, Redfin, etc.)
  
  // Placeholder: In production, you would:
  // const response = await fetch(`https://api.propertyradar.com/v1/properties?zip=${zip}`, {
  //   headers: { 'Authorization': `Bearer ${PROPERTY_RADAR_API_KEY}` }
  // });
  // const properties = await response.json();
  // return properties.map(transformToLead);

  return [];
}

/**
 * Get high-probability prospects from damage predictions
 * These are non-customers in red/yellow zones
 */
export async function getHighProbabilityProspects(
  stormId: string,
  teamId: string,
  minProbability: number = 0.4
): Promise<Array<{ predictionId: string; address: string; probability: number; zone: string }>> {
  const { data: predictions, error } = await supabase
    .from('storm_damage_predictions')
    .select('id, property_address, probability, zone, customer_id, lead_id')
    .eq('storm_id', stormId)
    .eq('team_id', teamId)
    .gte('probability', minProbability)
    .is('customer_id', null) // Not existing customers
    .order('probability', { ascending: false });

  if (error || !predictions) {
    console.error('Error fetching high-probability prospects:', error);
    return [];
  }

  return predictions
    .filter(p => !p.customer_id && !p.lead_id) // Not linked to existing records
    .map(p => ({
      predictionId: p.id,
      address: p.property_address || 'Unknown',
      probability: p.probability,
      zone: p.zone
    }));
}

/**
 * Create storm leads from high-probability damage predictions
 */
export async function createLeadsFromPredictions(
  stormId: string,
  teamId: string,
  predictionIds: string[]
): Promise<{ created: number; errors: number }> {
  let created = 0;
  let errors = 0;

  const { data: predictions } = await supabase
    .from('storm_damage_predictions')
    .select('id, property_address, property_latitude, property_longitude, probability, zone')
    .in('id', predictionIds)
    .eq('storm_id', stormId)
    .eq('team_id', teamId);

  if (!predictions) {
    return { created: 0, errors: predictionIds.length };
  }

  for (const prediction of predictions) {
    try {
      // Try to enrich with homeowner data (would use property lookup APIs)
      const enriched = await enrichPropertyData(prediction.property_address);

      const { error } = await supabase
        .from('storm_leads')
        .insert({
          storm_id: stormId,
          team_id: teamId,
          damage_prediction_id: prediction.id,
          source: 'geo_targeted',
          homeowner_name: enriched.name,
          address: prediction.property_address || '',
          phone: enriched.phone,
          email: enriched.email,
          status: 'new'
        });

      if (error) {
        console.error(`Error creating lead from prediction ${prediction.id}:`, error);
        errors++;
      } else {
        created++;
      }
    } catch (error) {
      console.error(`Error processing prediction ${prediction.id}:`, error);
      errors++;
    }
  }

  return { created, errors };
}

/**
 * Enrich property data with homeowner information
 * In production, would use property lookup APIs
 */
async function enrichPropertyData(address: string): Promise<{
  name?: string;
  phone?: string;
  email?: string;
}> {
  // TODO: Integrate with property lookup services
  // Examples:
  // - Whitepages API
  // - PropertyRadar API
  // - County assessor databases
  // - Skip tracing services
  
  return {
    name: undefined,
    phone: undefined,
    email: undefined
  };
}

/**
 * Get storm lead statistics
 */
export async function getStormLeadStats(
  stormId: string,
  teamId: string
): Promise<{
  total: number;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  highProbability: number;
}> {
  const { data: leads } = await supabase
    .from('storm_leads')
    .select('source, status, damage_prediction_id')
    .eq('storm_id', stormId)
    .eq('team_id', teamId);

  if (!leads) {
    return { total: 0, bySource: {}, byStatus: {}, highProbability: 0 };
  }

  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let highProbability = 0;

  for (const lead of leads) {
    bySource[lead.source] = (bySource[lead.source] || 0) + 1;
    byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
    
    if (lead.damage_prediction_id) {
      highProbability++;
    }
  }

  return {
    total: leads.length,
    bySource,
    byStatus,
    highProbability
  };
}






















