/**
 * Block 255000 — Storm Damage Predictions API
 * GET /api/storm/[stormId]/predictions - Get predictions for a storm
 * POST /api/storm/[stormId]/predictions - Generate predictions for properties
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateDamageProbability, batchCreateDamagePredictions } from '@/lib/storm/damage-probability';

export async function GET(
  req: NextRequest,
  { params }: { params: { stormId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const teamId = searchParams.get('teamId');
    const zone = searchParams.get('zone'); // 'red', 'yellow', 'green'

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    let query = supabase
      .from('storm_damage_predictions')
      .select('*')
      .eq('storm_id', params.stormId)
      .eq('team_id', teamId)
      .order('probability', { ascending: false });

    if (zone) {
      query = query.eq('zone', zone);
    }

    const { data: predictions, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ predictions: predictions || [] });
  } catch (error: any) {
    console.error('Error fetching predictions:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { stormId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { teamId, properties } = body;

    if (!teamId || !properties || !Array.isArray(properties)) {
      return NextResponse.json(
        { error: 'teamId and properties array are required' },
        { status: 400 }
      );
    }

    // Fetch storm data
    const { data: storm, error: stormError } = await supabase
      .from('storm_events')
      .select('storm_type, severity, center_latitude, center_longitude, hail_size_inches, max_wind_speed_mph, rainfall_inches')
      .eq('id', params.stormId)
      .single();

    if (stormError || !storm) {
      return NextResponse.json({ error: 'Storm not found' }, { status: 404 });
    }

    // Calculate distance from storm center for each property
    const predictions = properties.map((prop: any) => {
      const distance = prop.latitude && prop.longitude && storm.center_latitude && storm.center_longitude
        ? calculateDistance(
            prop.latitude,
            prop.longitude,
            storm.center_latitude,
            storm.center_longitude
          )
        : undefined;

      const stormData = {
        stormType: storm.storm_type,
        severity: storm.severity,
        hailSize: storm.hail_size_inches,
        windSpeed: storm.max_wind_speed_mph,
        rainfall: storm.rainfall_inches,
        distanceFromCenter: distance
      };

      const prediction = calculateDamageProbability(prop, stormData);
      return { property: prop, storm: stormData, prediction };
    });

    // Batch create predictions
    const result = await batchCreateDamagePredictions(
      params.stormId,
      teamId,
      predictions
    );

    return NextResponse.json({
      created: result.created,
      errors: result.errors,
      total: predictions.length
    });
  } catch (error: any) {
    console.error('Error generating predictions:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}






















