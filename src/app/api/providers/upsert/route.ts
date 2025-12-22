import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { validateProviderConfig } from '@/lib/senders';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { 
      id, // Optional - if provided, update existing provider
      workspace_id, 
      name, 
      type, 
      config, 
      weight, 
      daily_cap, 
      minute_cap, 
      enabled 
    } = body;

    // Validate required fields
    if (!workspace_id || !name || !type || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: workspace_id, name, type, config' },
        { status: 400 }
      );
    }

    // Verify user is member of workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
    }

    // Validate provider configuration
    if (!validateProviderConfig(type, config)) {
      return NextResponse.json(
        { error: `Invalid configuration for ${type} provider` },
        { status: 400 }
      );
    }

    // Prepare provider data
    const providerData = {
      workspace_id,
      name,
      type,
      config,
      weight: weight || 100,
      daily_cap: daily_cap || 10000,
      minute_cap: minute_cap || 100,
      enabled: enabled !== false, // Default to true
      updated_at: new Date().toISOString()
    };

    let result;
    if (id) {
      // Update existing provider
      const { data, error } = await supabase
        .from('providers')
        .update(providerData)
        .eq('id', id)
        .eq('workspace_id', workspace_id) // Security: ensure provider belongs to workspace
        .select()
        .single();

      if (error) {
        console.error('Error updating provider:', error);
        return NextResponse.json(
          { error: 'Failed to update provider' },
          { status: 500 }
        );
      }

      result = data;
    } else {
      // Create new provider
      const { data, error } = await supabase
        .from('providers')
        .insert({
          ...providerData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating provider:', error);
        return NextResponse.json(
          { error: 'Failed to create provider' },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json({
      success: true,
      provider: result
    });

  } catch (error) {
    console.error('Error upserting provider:', error);
    return NextResponse.json(
      { error: 'Failed to save provider' },
      { status: 500 }
    );
  }
} 