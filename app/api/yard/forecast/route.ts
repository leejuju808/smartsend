/**
 * Block 256200: Material Forecasting API
 * GET /api/yard/forecast - Get material forecasts for a company
 * POST /api/yard/forecast - Create/update material forecasts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get('company_id');
    const material_name = searchParams.get('material_name');
    const days_ahead = parseInt(searchParams.get('days_ahead') || '14');
    const start_date = searchParams.get('start_date') || new Date().toISOString().split('T')[0];

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    const end_date = new Date(start_date);
    end_date.setDate(end_date.getDate() + days_ahead);

    let query = supabase
      .from('yard_forecasting')
      .select('*')
      .eq('company_id', company_id)
      .gte('forecast_date', start_date)
      .lte('forecast_date', end_date.toISOString().split('T')[0]);

    if (material_name) {
      query = query.eq('material_name', material_name);
    }

    query = query.order('forecast_date', { ascending: true })
      .order('material_name', { ascending: true });

    const { data: forecasts, error } = await query;

    if (error) {
      console.error('Error fetching forecasts:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Group by material and calculate totals
    const forecastSummary: Record<string, any> = {};
    forecasts?.forEach((forecast: any) => {
      if (!forecastSummary[forecast.material_name]) {
        forecastSummary[forecast.material_name] = {
          material_name: forecast.material_name,
          material_category: forecast.material_category,
          total_projected_usage: 0,
          total_jobs_count: 0,
          forecasts: [],
        };
      }
      forecastSummary[forecast.material_name].total_projected_usage += forecast.projected_usage;
      forecastSummary[forecast.material_name].total_jobs_count += forecast.jobs_count;
      forecastSummary[forecast.material_name].forecasts.push(forecast);
    });

    return NextResponse.json({
      ok: true,
      forecasts: forecasts || [],
      summary: Object.values(forecastSummary),
    });
  } catch (error: any) {
    console.error('Error in forecast API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      company_id,
      material_name,
      material_category,
      projected_usage,
      forecast_date,
      days_ahead,
      jobs_count,
      historical_avg,
      seasonality_factor,
      storm_probability,
      forecast_method = 'ai',
      confidence_score,
    } = body;

    if (!company_id || !material_name || !projected_usage || !forecast_date) {
      return NextResponse.json(
        { error: 'company_id, material_name, projected_usage, and forecast_date are required' },
        { status: 400 }
      );
    }

    const { data: forecast, error } = await supabase
      .from('yard_forecasting')
      .upsert({
        company_id,
        material_name,
        material_category: material_category || null,
        projected_usage,
        forecast_date,
        days_ahead: days_ahead || 14,
        jobs_count: jobs_count || 0,
        historical_avg: historical_avg || null,
        seasonality_factor: seasonality_factor || 1.0,
        storm_probability: storm_probability || 0.0,
        forecast_method,
        confidence_score: confidence_score || 0.5,
      }, {
        onConflict: 'company_id,material_name,forecast_date',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating/updating forecast:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      forecast,
    });
  } catch (error: any) {
    console.error('Error in forecast API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















