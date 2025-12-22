/**
 * Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
 * 
 * Scheduling supercomputer that automatically plans, adjusts, and protects roofing schedules.
 * Features:
 * - Weather-Aware Scheduling
 * - Automatic Job Rescheduling
 * - Conflict Detection & Prevention
 * - Crew Capacity Forecasting
 * - Material Delivery Coordination
 * - Customer Communication Automation
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface WeatherRisk {
  score: number; // 0.0 to 1.0
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  threats: string[];
  recommendation: string;
  alternativeDate?: string;
}

export interface ScheduleConflict {
  id?: string;
  eventId: string;
  conflictingEventId?: string;
  conflictType: 'crew_double_book' | 'weather_block' | 'material_delay' | 'overlapping_jobs' | 'crew_distance' | 'inspection_overlap' | 'capacity_overload' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  resolutionSuggestion?: string;
  resolved?: boolean;
}

export interface CapacityForecast {
  date: string;
  crewAvailable: number;
  crewNeeded: number;
  crewUtilized: number;
  workloadStatus: 'under_capacity' | 'balanced' | 'overloaded' | 'critical_overload';
  availableCapacityHours: number;
  scheduledHours: number;
  utilizationPercentage: number;
}

export interface RescheduleOptions {
  eventId: string;
  reason: string;
  newStartTime?: string;
  newCrewId?: string;
  notifyCustomer?: boolean;
  updateMaterials?: boolean;
}

/**
 * Check weather risk for a scheduled event
 */
export async function checkWeatherRisk(
  jobId: string,
  eventDate: string,
  location?: { city?: string; state?: string; zip?: string; lat?: number; lng?: number }
): Promise<WeatherRisk> {
  try {
    // Get job location if not provided
    if (!location) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: job } = await supabase
        .from('roofing_jobs')
        .select('*, leads(address, city, state, zip)')
        .eq('id', jobId)
        .single();

      if (job?.leads) {
        location = {
          city: job.leads.city,
          state: job.leads.state,
          zip: job.leads.zip,
        };
      }
    }

    if (!location) {
      return {
        score: 0.0,
        riskLevel: 'low',
        threats: [],
        recommendation: 'Location not available for weather check',
      };
    }

    // Check if weather data exists in job_weather_status
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: weatherStatus } = await supabase
      .from('job_weather_status')
      .select('forecast, weather_risk_score')
      .eq('job_id', jobId)
      .single();

    if (weatherStatus?.forecast) {
      const forecast = weatherStatus.forecast as any;
      const eventDateObj = new Date(eventDate);
      
      // Find matching forecast data
      const hourlyForecast = forecast.hourly || [];
      const relevantHours = hourlyForecast.filter((h: any) => {
        const hourDate = new Date(h.timestamp);
        return hourDate.toDateString() === eventDateObj.toDateString();
      });

      if (relevantHours.length > 0) {
        const threats: string[] = [];
        let riskScore = 0.0;

        for (const hour of relevantHours) {
          // Check rain
          if (hour.precipitation_probability > 0.5 || hour.rain_mm > 0) {
            threats.push(`Rain (${Math.round(hour.precipitation_probability * 100)}% chance)`);
            riskScore = Math.max(riskScore, 0.7);
          }

          // Check wind
          if (hour.wind_speed_mph > 25) {
            threats.push(`High winds (${Math.round(hour.wind_speed_mph)} mph)`);
            riskScore = Math.max(riskScore, hour.wind_speed_mph > 40 ? 0.9 : 0.6);
          }

          // Check lightning
          if (hour.lightning_risk > 0.3) {
            threats.push(`Lightning risk (${Math.round(hour.lightning_risk * 100)}%)`);
            riskScore = Math.max(riskScore, 0.95);
          }

          // Check hail
          if (hour.hail_risk > 0.2) {
            threats.push(`Hail risk (${Math.round(hour.hail_risk * 100)}%)`);
            riskScore = Math.max(riskScore, 0.85);
          }

          // Check temperature (too cold for shingles)
          if (hour.temperature_f < 45) {
            threats.push(`Cold temperature (${Math.round(hour.temperature_f)}°F - shingle seal issues)`);
            riskScore = Math.max(riskScore, 0.5);
          }

          // Check humidity (affects shingle sealing)
          if (hour.humidity_percent > 85) {
            threats.push(`High humidity (${Math.round(hour.humidity_percent)}% - shingle seal issues)`);
            riskScore = Math.max(riskScore, 0.4);
          }
        }

        const riskLevel: WeatherRisk['riskLevel'] = 
          riskScore >= 0.8 ? 'critical' :
          riskScore >= 0.6 ? 'high' :
          riskScore >= 0.3 ? 'medium' : 'low';

        let recommendation = '';
        if (riskScore >= 0.6) {
          recommendation = `Weather risk detected. Consider rescheduling to avoid delays.`;
        } else if (riskScore >= 0.3) {
          recommendation = `Moderate weather risk. Monitor conditions closely.`;
        } else {
          recommendation = `Weather conditions look favorable.`;
        }

        // Find alternative date (next 7 days with low risk)
        let alternativeDate: string | undefined;
        if (riskScore >= 0.6) {
          const dailyForecast = forecast.daily || [];
          for (let i = 1; i < Math.min(7, dailyForecast.length); i++) {
            const day = dailyForecast[i];
            if (day.weather_risk_score < 0.3) {
              alternativeDate = day.date;
              break;
            }
          }
        }

        return {
          score: riskScore,
          riskLevel,
          threats: [...new Set(threats)],
          recommendation,
          alternativeDate,
        };
      }
    }

    // Fallback: use weather API if available
    // This would call the existing weather intelligence system
    return {
      score: 0.0,
      riskLevel: 'low',
      threats: [],
      recommendation: 'Weather data not available',
    };
  } catch (error) {
    console.error('Error checking weather risk:', error);
    return {
      score: 0.0,
      riskLevel: 'low',
      threats: [],
      recommendation: 'Error checking weather',
    };
  }
}

/**
 * Detect schedule conflicts for a workspace
 */
export async function detectConflicts(
  workspaceId: string,
  startDate: string = new Date().toISOString().split('T')[0],
  endDate: string = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
): Promise<ScheduleConflict[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Use the database function to detect conflicts
    const { data, error } = await supabase.rpc('detect_schedule_conflicts', {
      p_workspace_id: workspaceId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      console.error('Error detecting conflicts:', error);
      return [];
    }

    return (data || []).map((conflict: any) => ({
      id: conflict.conflict_id,
      eventId: conflict.event_id,
      conflictType: conflict.conflict_type as ScheduleConflict['conflictType'],
      severity: conflict.severity as ScheduleConflict['severity'],
      description: conflict.description,
    }));
  } catch (error) {
    console.error('Error detecting conflicts:', error);
    return [];
  }
}

/**
 * Calculate capacity forecast for a workspace
 */
export async function calculateCapacityForecast(
  workspaceId: string,
  startDate: string = new Date().toISOString().split('T')[0],
  endDate: string = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
): Promise<CapacityForecast[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Calculate forecast using database function
    await supabase.rpc('calculate_capacity_forecast', {
      p_workspace_id: workspaceId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    // Fetch the calculated forecasts
    const { data, error } = await supabase
      .from('capacity_forecasts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .gte('forecast_date', startDate)
      .lte('forecast_date', endDate)
      .order('forecast_date', { ascending: true });

    if (error) {
      console.error('Error fetching capacity forecast:', error);
      return [];
    }

    return (data || []).map((forecast: any) => ({
      date: forecast.forecast_date,
      crewAvailable: forecast.crew_available,
      crewNeeded: forecast.crew_needed,
      crewUtilized: forecast.crew_utilized,
      workloadStatus: forecast.workload_status as CapacityForecast['workloadStatus'],
      availableCapacityHours: parseFloat(forecast.available_capacity_hours || 0),
      scheduledHours: parseFloat(forecast.scheduled_hours || 0),
      utilizationPercentage: parseFloat(forecast.utilization_percentage || 0),
    }));
  } catch (error) {
    console.error('Error calculating capacity forecast:', error);
    return [];
  }
}

/**
 * Auto-reschedule an event
 */
export async function autoRescheduleEvent(
  workspaceId: string,
  options: RescheduleOptions
): Promise<{ success: boolean; newEventId?: string; error?: string }> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the original event
    const { data: originalEvent, error: eventError } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('id', options.eventId)
      .eq('workspace_id', workspaceId)
      .single();

    if (eventError || !originalEvent) {
      return { success: false, error: 'Event not found' };
    }

    // Find next available slot if newStartTime not provided
    let newStartTime = options.newStartTime;
    let newCrewId = options.newCrewId || originalEvent.crew_id;

    if (!newStartTime && newCrewId) {
      const durationHours = originalEvent.end_time && originalEvent.start_time
        ? (new Date(originalEvent.end_time).getTime() - new Date(originalEvent.start_time).getTime()) / (1000 * 60 * 60)
        : 8;

      const { data: slotData } = await supabase.rpc('find_next_available_slot', {
        p_workspace_id: workspaceId,
        p_crew_id: newCrewId,
        p_duration_hours: durationHours,
        p_start_from: new Date().toISOString().split('T')[0],
      });

      if (slotData) {
        newStartTime = slotData;
      } else {
        return { success: false, error: 'No available slot found' };
      }
    }

    if (!newStartTime) {
      return { success: false, error: 'New start time required' };
    }

    // Calculate new end time
    const duration = originalEvent.end_time && originalEvent.start_time
      ? new Date(originalEvent.end_time).getTime() - new Date(originalEvent.start_time).getTime()
      : 8 * 60 * 60 * 1000; // Default 8 hours
    const newEndTime = new Date(new Date(newStartTime).getTime() + duration).toISOString();

    // Create new event (or update existing)
    const { data: newEvent, error: createError } = await supabase
      .from('calendar_events')
      .upsert({
        id: originalEvent.id, // Update existing event
        workspace_id: workspaceId,
        job_id: originalEvent.job_id,
        lead_id: originalEvent.lead_id,
        crew_id: newCrewId,
        event_type: originalEvent.event_type,
        title: originalEvent.title,
        description: originalEvent.description,
        start_time: newStartTime,
        end_time: newEndTime,
        event_status: 'rescheduled',
        reschedule_reason: options.reason,
        auto_rescheduled_from: originalEvent.id,
        customer_notified: options.notifyCustomer ? false : originalEvent.customer_notified,
        weather_risk_score: 0, // Will be recalculated
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (createError) {
      return { success: false, error: createError.message };
    }

    // Update material delivery if needed
    if (options.updateMaterials && originalEvent.material_delivery_id) {
      await supabase
        .from('material_deliveries')
        .update({
          delivery_date: newStartTime.split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', originalEvent.material_delivery_id);
    }

    // Notify customer if requested
    if (options.notifyCustomer && originalEvent.job_id) {
      await notifyCustomerOfReschedule(workspaceId, originalEvent.job_id, {
        oldDate: originalEvent.start_time,
        newDate: newStartTime,
        reason: options.reason,
      });
    }

    // Mark original event as rescheduled
    await supabase
      .from('calendar_events')
      .update({
        event_status: 'rescheduled',
        customer_notified: true,
        customer_notified_at: new Date().toISOString(),
      })
      .eq('id', originalEvent.id);

    return { success: true, newEventId: newEvent.id };
  } catch (error) {
    console.error('Error auto-rescheduling event:', error);
    return { success: false, error: 'Failed to reschedule event' };
  }
}

/**
 * Notify customer of schedule change
 */
async function notifyCustomerOfReschedule(
  workspaceId: string,
  jobId: string,
  details: { oldDate: string; newDate: string; reason: string }
): Promise<void> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get job and lead info
    const { data: job } = await supabase
      .from('roofing_jobs')
      .select('*, leads(email, name)')
      .eq('id', jobId)
      .single();

    if (!job?.leads?.email) {
      return;
    }

    // Format dates
    const oldDate = new Date(details.oldDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const newDate = new Date(details.newDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Create message
    const message = `Due to ${details.reason}, your installation has been moved from ${oldDate} to ${newDate}. We apologize for any inconvenience and look forward to completing your project.`;

    // Send via inbox system if available
    // This would integrate with the existing inbox/email system
    // For now, we'll just log it
    console.log('Customer notification:', {
      to: job.leads.email,
      subject: 'Schedule Update',
      message,
    });

    // TODO: Integrate with actual email/inbox system
  } catch (error) {
    console.error('Error notifying customer:', error);
  }
}

/**
 * Get multi-crew calendar view
 */
export async function getMultiCrewCalendar(
  workspaceId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('calendar_events')
      .select(`
        *,
        crews(name, foreman_name),
        roofing_jobs(title, job_value, status),
        leads(name, email, phone, address)
      `)
      .eq('workspace_id', workspaceId)
      .gte('start_time', startDate)
      .lte('start_time', endDate)
      .in('event_status', ['scheduled', 'rescheduled'])
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching calendar:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting multi-crew calendar:', error);
    return [];
  }
}

/**
 * Check material delivery timing against job schedule
 */
export async function checkMaterialDeliveryTiming(
  jobId: string,
  deliveryDate: string,
  jobStartTime: string
): Promise<{ onTime: boolean; issue?: string; recommendation?: string }> {
  try {
    const deliveryDateObj = new Date(deliveryDate);
    const jobStartObj = new Date(jobStartTime);
    
    // Material should arrive at least 1 hour before job start
    const requiredGap = 60 * 60 * 1000; // 1 hour in milliseconds
    const actualGap = jobStartObj.getTime() - deliveryDateObj.getTime();

    if (actualGap < requiredGap) {
      return {
        onTime: false,
        issue: 'Material delivery is too close to job start time',
        recommendation: `Move delivery to at least 1 hour before job start (${new Date(jobStartObj.getTime() - requiredGap).toLocaleString()})`,
      };
    }

    return { onTime: true };
  } catch (error) {
    console.error('Error checking material delivery timing:', error);
    return { onTime: false, issue: 'Error checking timing' };
  }
}

/**
 * Schedule material delivery for a job
 * Creates calendar event and links to material delivery
 */
export async function scheduleMaterialDelivery(
  workspaceId: string,
  jobId: string,
  materialDeliveryId: string,
  deliveryDate: string,
  deliveryWindowStart?: string,
  deliveryWindowEnd?: string
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get job info
    const { data: job } = await supabase
      .from('roofing_jobs')
      .select('*, leads(name, address)')
      .eq('id', jobId)
      .single();

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    // Get material delivery info
    const { data: delivery } = await supabase
      .from('material_deliveries')
      .select('*')
      .eq('id', materialDeliveryId)
      .single();

    if (!delivery) {
      return { success: false, error: 'Material delivery not found' };
    }

    // Calculate delivery time window
    const deliveryStart = deliveryWindowStart || `${deliveryDate}T08:00:00`;
    const deliveryEnd = deliveryWindowEnd || `${deliveryDate}T12:00:00`;

    // Create calendar event for material delivery
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .upsert({
        workspace_id: workspaceId,
        job_id: jobId,
        material_delivery_id: materialDeliveryId,
        event_type: 'material_delivery',
        title: `Material Delivery - ${job.leads?.name || 'Job'} ${jobId.slice(0, 8)}`,
        description: `Material delivery scheduled for ${deliveryDate}`,
        start_time: deliveryStart,
        end_time: deliveryEnd,
        event_status: 'scheduled',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'material_delivery_id',
      })
      .select()
      .single();

    if (eventError) {
      return { success: false, error: eventError.message };
    }

    // Update material delivery with calendar event link
    await supabase
      .from('material_deliveries')
      .update({
        delivery_date: deliveryDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', materialDeliveryId);

    return { success: true, eventId: event.id };
  } catch (error) {
    console.error('Error scheduling material delivery:', error);
    return { success: false, error: 'Failed to schedule material delivery' };
  }
}

/**
 * Schedule inspection for a job
 * Creates calendar event for inspection
 */
export async function scheduleInspection(
  workspaceId: string,
  jobId: string,
  inspectionDate: string,
  inspectionTime: string,
  inspectionType?: string,
  inspectorName?: string
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get job info
    const { data: job } = await supabase
      .from('roofing_jobs')
      .select('*, leads(name, address)')
      .eq('id', jobId)
      .single();

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    // Create calendar event for inspection
    const inspectionStart = `${inspectionDate}T${inspectionTime}`;
    const inspectionEnd = new Date(new Date(inspectionStart).getTime() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours default

    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .insert({
        workspace_id: workspaceId,
        job_id: jobId,
        event_type: 'inspection',
        title: `Inspection - ${inspectionType || 'Roof'} - ${job.leads?.name || 'Job'} ${jobId.slice(0, 8)}`,
        description: `Inspection scheduled${inspectorName ? ` with ${inspectorName}` : ''}`,
        start_time: inspectionStart,
        end_time: inspectionEnd,
        event_status: 'scheduled',
        metadata: {
          inspection_type: inspectionType || 'roof',
          inspector_name: inspectorName,
        },
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (eventError) {
      return { success: false, error: eventError.message };
    }

    return { success: true, eventId: event.id };
  } catch (error) {
    console.error('Error scheduling inspection:', error);
    return { success: false, error: 'Failed to schedule inspection' };
  }
}

/**
 * Auto-schedule material delivery based on job start date
 * Ensures materials arrive before crew
 */
export async function autoScheduleMaterialDelivery(
  workspaceId: string,
  jobId: string,
  jobStartTime: string
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get job and material orders
    const { data: job } = await supabase
      .from('roofing_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    // Find material orders for this job
    const { data: materialOrders } = await supabase
      .from('material_orders')
      .select('*, material_deliveries(id, delivery_date, status)')
      .eq('job_id', jobId)
      .eq('status', 'ordered');

    if (!materialOrders || materialOrders.length === 0) {
      return { success: false, error: 'No material orders found for this job' };
    }

    // Calculate delivery date (1 day before job start, or same day early morning)
    const jobStart = new Date(jobStartTime);
    const deliveryDate = new Date(jobStart);
    deliveryDate.setDate(deliveryDate.getDate() - 1);
    deliveryDate.setHours(7, 0, 0, 0); // 7 AM delivery

    // If delivery would be in the past, schedule for same day but early
    if (deliveryDate < new Date()) {
      deliveryDate.setTime(jobStart.getTime());
      deliveryDate.setHours(7, 0, 0, 0);
    }

    // Create or update material deliveries and calendar events
    for (const order of materialOrders) {
      // Find or create material delivery
      let deliveryId = order.material_deliveries?.[0]?.id;

      if (!deliveryId) {
        const { data: newDelivery } = await supabase
          .from('material_deliveries')
          .insert({
            material_order_id: order.id,
            workspace_id: workspaceId,
            job_id: jobId,
            delivery_date: deliveryDate.toISOString().split('T')[0],
            status: 'scheduled',
          })
          .select()
          .single();

        if (newDelivery) {
          deliveryId = newDelivery.id;
        }
      }

      if (deliveryId) {
        // Schedule calendar event
        await scheduleMaterialDelivery(
          workspaceId,
          jobId,
          deliveryId,
          deliveryDate.toISOString().split('T')[0],
          deliveryDate.toISOString(),
          new Date(deliveryDate.getTime() + 4 * 60 * 60 * 1000).toISOString() // 4 hour window
        );
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error auto-scheduling material delivery:', error);
    return { success: false, error: 'Failed to auto-schedule material delivery' };
  }
}





















