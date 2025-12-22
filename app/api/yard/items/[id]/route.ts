/**
 * Block 256200: Yard Inventory Item API
 * GET /api/yard/items/[id] - Get a single yard item
 * PATCH /api/yard/items/[id] - Update a yard item
 * DELETE /api/yard/items/[id] - Delete a yard item (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: item, error } = await supabase
      .from('yard_items')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      console.error('Error fetching yard item:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!item) {
      return NextResponse.json(
        { error: 'Yard item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      item,
    });
  } catch (error: any) {
    console.error('Error in yard item API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
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
      is_active,
    } = body;

    const updateData: any = {};
    if (material_name !== undefined) updateData.material_name = material_name;
    if (material_category !== undefined) updateData.material_category = material_category;
    if (unit !== undefined) updateData.unit = unit;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (min_quantity !== undefined) updateData.min_quantity = min_quantity;
    if (max_quantity !== undefined) updateData.max_quantity = max_quantity;
    if (brand !== undefined) updateData.brand = brand;
    if (color !== undefined) updateData.color = color;
    if (sku !== undefined) updateData.sku = sku;
    if (cost_per_unit !== undefined) updateData.cost_per_unit = cost_per_unit;
    if (supplier_name !== undefined) updateData.supplier_name = supplier_name;
    if (location !== undefined) updateData.location = location;
    if (notes !== undefined) updateData.notes = notes;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: item, error } = await supabase
      .from('yard_items')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating yard item:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!item) {
      return NextResponse.json(
        { error: 'Yard item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      item,
    });
  } catch (error: any) {
    console.error('Error updating yard item:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Soft delete by setting is_active to false
    const { data: item, error } = await supabase
      .from('yard_items')
      .update({ is_active: false })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Error deleting yard item:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!item) {
      return NextResponse.json(
        { error: 'Yard item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Yard item deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting yard item:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















