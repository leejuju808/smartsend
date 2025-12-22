/**
 * Block 255000 — Automatic Storm Detection Cron Job
 * Runs periodically to detect storms and trigger response automation
 * POST /api/cron/storm-detect
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectStormFromWeatherData, createStormEvent } from '@/lib/storm/storm-detection';
import { batchCreateDamagePredictions } from '@/lib/storm/damage-probability';
import { sendPastCustomerOutreach } from '@/lib/storm/outreach-automation';
import { generateStormLeads } from '@/lib/storm/lead-generator';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all active teams
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, name');

    if (teamsError || !teams) {
      console.error('Error fetching teams:', teamsError);
      return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
    }

    const results = {
      teamsProcessed: 0,
      stormsDetected: 0,
      predictionsCreated: 0,
      outreachSent: 0,
      leadsGenerated: 0,
      errors: 0
    };

    // Process each team
    for (const team of teams) {
      try {
        // Get team's service area (ZIP codes they serve)
        // This would come from team settings or customer locations
        const { data: customers } = await supabase
          .from('customers')
          .select('zip_code, property_latitude, property_longitude')
          .eq('team_id', team.id)
          .not('zip_code', 'is', null)
          .limit(100); // Sample for detection

        if (!customers || customers.length === 0) {
          continue; // Skip teams with no customers
        }

        // Get unique ZIPs
        const zips = [...new Set(customers.map(c => c.zip_code).filter(Boolean))];

        // Check weather for each ZIP (in production, would batch or use weather API that supports multiple locations)
        for (const zip of zips.slice(0, 10)) { // Limit to 10 ZIPs per team for cron efficiency
          try {
            // Fetch weather data (would use actual weather API)
            // For now, this is a placeholder - in production would call weather API
            const weatherData = await fetchWeatherForZip(zip);

            if (!weatherData) continue;

            // Detect storm
            const location = {
              zip,
              lat: customers.find(c => c.zip_code === zip)?.property_latitude,
              lon: customers.find(c => c.zip_code === zip)?.property_longitude
            };

            const detection = await detectStormFromWeatherData(weatherData, location);

            if (!detection.stormDetected) continue;

            // Create storm event
            const { id: stormId, error: stormError } = await createStormEvent(team.id, detection);

            if (stormError || !stormId) {
              results.errors++;
              continue;
            }

            results.stormsDetected++;

            // Generate damage predictions for customers in affected area
            const affectedCustomers = customers.filter(c => 
              c.zip_code === zip && c.property_latitude && c.property_longitude
            );

            if (affectedCustomers.length > 0) {
              const properties = affectedCustomers.map(c => ({
                property: {
                  customerId: c.id,
                  latitude: c.property_latitude,
                  longitude: c.property_longitude,
                  zipCode: c.zip_code
                },
                storm: {
                  stormType: detection.stormType!,
                  severity: detection.severity!,
                  hailSize: detection.hailSize,
                  windSpeed: detection.windSpeed,
                  rainfall: detection.rainfall,
                  distanceFromCenter: 0 // Would calculate from storm center
                }
              }));

              const predResult = await batchCreateDamagePredictions(stormId, team.id, properties);
              results.predictionsCreated += predResult.created;

              // Get high-probability customers (red zone)
              const { data: redZonePredictions } = await supabase
                .from('storm_damage_predictions')
                .select('customer_id')
                .eq('storm_id', stormId)
                .eq('team_id', team.id)
                .eq('zone', 'red')
                .not('customer_id', 'is', null);

              if (redZonePredictions && redZonePredictions.length > 0) {
                const customerIds = redZonePredictions
                  .map(p => p.customer_id)
                  .filter((id): id is string => id !== null);

                // Send outreach to past customers
                const outreachResult = await sendPastCustomerOutreach(
                  stormId,
                  team.id,
                  customerIds
                );
                results.outreachSent += outreachResult.sent;
              }

              // Generate storm leads for affected ZIPs
              if (detection.affectedArea?.zips) {
                const leadResult = await generateStormLeads(
                  stormId,
                  team.id,
                  detection.affectedArea.zips
                );
                results.leadsGenerated += leadResult.created;
              }
            }
          } catch (error) {
            console.error(`Error processing ZIP ${zip} for team ${team.id}:`, error);
            results.errors++;
          }
        }

        results.teamsProcessed++;
      } catch (error) {
        console.error(`Error processing team ${team.id}:`, error);
        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error in storm detection cron:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Fetch weather data for a ZIP code
 * Placeholder - would integrate with actual weather API
 */
async function fetchWeatherForZip(zip: string): Promise<any | null> {
  // TODO: Integrate with weather API (WeatherAPI.com, OpenWeatherMap, etc.)
  // const apiKey = process.env.WEATHER_API_KEY;
  // const response = await fetch(`https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${zip}`);
  // return await response.json();
  
  // For now, return null (no storms detected in placeholder)
  return null;
}























