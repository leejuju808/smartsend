/**
 * Block 256200: Yard Inventory Items API
 * GET /api/yard/items - List yard items for a company
 * POST /api/yard/items - Create a new yard item
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
    const category = searchParams.get('category');
    const low_stock_only = searchParams.get('low_stock_only') === 'true';
    const is_active = searchParams.get('is_active') !== 'false'; // Default to true

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('yard_items')
      .select('*')
      .eq('company_id', company_id);

    if (category) {
      query = query.eq('material_category', category);
    }

    if (low_stock_only) {
      query = query.lte('quantity', supabase.raw('min_quantity'));
    }

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active);
    }

    query = query.order('material_name', { ascending: true });

    const { data: items, error } = await query;

    if (error) {
      console.error('Error fetching yard items:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      items: items || [],
    });
  } catch (error: any) {
    console.error('Error in yard items API:', error);
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
      unit,
      quantity,
      min_quantity,
      max_quantity,
      brand,
      color,
      sku,
      cost_per_unit,
      supplier_name,
      location,
      notes,
    } = body;

    if (!company_id || !material_name || !unit) {
      return NextResponse.json(
        { error: 'company_id, material_name, and unit are required' },
        { status: 400 }
      );
    }

    const { data: item, error } = await supabase
      .from('yard_items')
      .insert({
        company_id,
        material_name,
        material_category: material_category || null,
        unit,
        quantity: quantity || 0,
        min_quantity: min_quantity || 0,
        max_quantity: max_quantity || null,
        brand: brand || null,
        color: color || null,
        sku: sku || null,
        cost_per_unit: cost_per_unit || null,
        supplier_name: supplier_name || null,
        location: location || null,
        notes: notes || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating yard item:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      item,
    });
  } catch (error: any) {
    console.error('Error creating yard item:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















