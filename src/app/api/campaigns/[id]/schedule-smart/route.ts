/**
 * API Route: Create Smart Send Schedule
 * POST /api/campaigns/[id]/schedule-smart
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { generateSendWaves, createWavesInDatabase } from '@/lib/smart-send/wave-generator';

export async function POST(
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
      scheduleType,
      sendTime,
      startDate,
      endDate,
      intervalMinutes,
      emailsPerHour,
      smartSendEnabled,
      smartSendMinHour,
      smartSendMaxHour,
      smartSendDaysOfWeek,
      waveSize,
      waveIntervalMinutes,
      enableDomainStaggering,
      domainStaggerMinutes,
      enableWeatherScheduling,
      weatherPriorityZipcodes,
      recipientIds, // Array of lead IDs to send to
    } = body;

    // Get campaign and workspace
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, workspace_id')
      .eq('id', params.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    const workspaceId = campaign.workspace_id;

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get recipients
    let recipients: Array<{ leadId: string; email: string; zipcode?: string }> = [];

    if (recipientIds && recipientIds.length > 0) {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, email')
        .in('id', recipientIds);

      // Get ZIP codes from lead_locations
      const { data: locations } = await supabase
        .from('lead_locations')
        .select('lead_id, zipcode')
        .in('lead_id', recipientIds);

      const locationMap = new Map(
        locations?.map((l) => [l.lead_id, l.zipcode]) || []
      );

      recipients =
        leads?.map((lead) => ({
          leadId: lead.id,
          email: lead.email,
          zipcode: locationMap.get(lead.id) || undefined,
        })) || [];
    } else {
      // Get all leads for campaign
      const { data: campaignLeads } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', params.id);

      if (campaignLeads && campaignLeads.length > 0) {
        const leadIds = campaignLeads.map((cl) => cl.lead_id);
        const { data: leads } = await supabase
          .from('leads')
          .select('id, email')
          .in('id', leadIds);

        const { data: locations } = await supabase
          .from('lead_locations')
          .select('lead_id, zipcode')
          .in('lead_id', leadIds);

        const locationMap = new Map(
          locations?.map((l) => [l.lead_id, l.zipcode]) || []
        );

        recipients =
          leads?.map((lead) => ({
            leadId: lead.id,
            email: lead.email,
            zipcode: locationMap.get(lead.id) || undefined,
          })) || [];
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'No recipients found' },
        { status: 400 }
      );
    }

    // Create schedule
    const scheduleData: any = {
      workspace_id: workspaceId,
      campaign_id: params.id,
      schedule_type: scheduleType || 'smart_send',
      start_date: startDate || new Date().toISOString().split('T')[0],
      end_date: endDate || null,
      smart_send_enabled: smartSendEnabled !== false,
      smart_send_min_hour: smartSendMinHour || 9,
      smart_send_max_hour: smartSendMaxHour || 17,
      smart_send_days_of_week: smartSendDaysOfWeek || [1, 2, 3, 4, 5],
      wave_size: waveSize || 50,
      wave_interval_minutes: waveIntervalMinutes || 30,
      enable_domain_staggering: enableDomainStaggering || false,
      domain_stagger_minutes: domainStaggerMinutes || 15,
      enable_weather_scheduling: enableWeatherScheduling || false,
      weather_priority_zipcodes: weatherPriorityZipcodes || [],
      status: 'active',
    };

    if (scheduleType === 'specific_time' && sendTime) {
      scheduleData.send_time = sendTime;
    }

    if (scheduleType === 'interval') {
      scheduleData.interval_minutes = intervalMinutes;
      scheduleData.emails_per_hour = emailsPerHour;
    }

    const { data: schedule, error: scheduleError } = await supabase
      .from('campaign_schedules')
      .insert(scheduleData)
      .select('id')
      .single();

    if (scheduleError || !schedule) {
      console.error('Schedule creation error:', scheduleError);
      return NextResponse.json(
        { error: 'Failed to create schedule', details: scheduleError?.message },
        { status: 500 }
      );
    }

    // Generate waves if Smart Send is enabled
    if (scheduleType === 'smart_send' || smartSendEnabled) {
      try {
        const waves = await generateSendWaves({
          scheduleId: schedule.id,
          campaignId: params.id,
          workspaceId,
          recipients,
          waveSize: waveSize || 50,
          waveIntervalMinutes: waveIntervalMinutes || 30,
          startDate: startDate ? new Date(startDate) : new Date(),
        });

        await createWavesInDatabase(waves, {
          scheduleId: schedule.id,
          campaignId: params.id,
          workspaceId,
          recipients,
          waveSize: waveSize || 50,
          waveIntervalMinutes: waveIntervalMinutes || 30,
        });

        return NextResponse.json({
          success: true,
          scheduleId: schedule.id,
          wavesCreated: waves.length,
          totalRecipients: recipients.length,
        });
      } catch (waveError: any) {
        console.error('Wave generation error:', waveError);
        return NextResponse.json(
          {
            error: 'Failed to generate waves',
            details: waveError?.message,
            scheduleId: schedule.id, // Schedule created, but waves failed
          },
          { status: 500 }
        );
      }
    }

    // Update campaign status
    await supabase
      .from('campaigns')
      .update({ status: 'scheduled' })
      .eq('id', params.id);

    return NextResponse.json({
      success: true,
      scheduleId: schedule.id,
      totalRecipients: recipients.length,
    });
  } catch (error: any) {
    console.error('Schedule creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}



























