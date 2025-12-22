/**
 * Block 255000 — Storm Detection API
 * POST /api/storm/detect
 * Manually trigger storm detection or process detected storm
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectStormFromWeatherData, createStormEvent } from '@/lib/storm/storm-detection';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { teamId, weatherData, location, manual } = body;

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    // Verify user has access to team
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // If manual storm creation
    if (manual && body.stormData) {
      const { data: storm, error } = await supabase
        .from('storm_events')
        .insert({
          team_id: teamId,
          storm_type: body.stormData.stormType,
          severity: body.stormData.severity,
          detected_at: new Date().toISOString(),
          detected_by: 'manual',
          geo: body.stormData.geo,
          max_wind_speed_mph: body.stormData.windSpeed,
          hail_size_inches: body.stormData.hailSize,
          rainfall_inches: body.stormData.rainfall,
          affected_radius_miles: body.stormData.radius,
          affected_zips: body.stormData.zips || [],
          affected_cities: body.stormData.cities || [],
          affected_states: body.stormData.states || [],
          center_latitude: body.stormData.centerLat,
          center_longitude: body.stormData.centerLon,
          weather_api_data: body.stormData.weatherData || {},
          status: 'active'
        })
        .select('id')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ stormId: storm.id, created: true });
    }

    // Auto-detect from weather data
    if (!weatherData || !location) {
      return NextResponse.json(
        { error: 'weatherData and location are required for auto-detection' },
        { status: 400 }
      );
    }

    const detection = await detectStormFromWeatherData(weatherData, location);

    if (!detection.stormDetected) {
      return NextResponse.json({ stormDetected: false });
    }

    const result = await createStormEvent(teamId, detection);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      stormDetected: true,
      stormId: result.id,
      stormType: detection.stormType,
      severity: detection.severity
    });
  } catch (error: any) {
    console.error('Error in storm detection:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






















