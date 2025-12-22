// Block 60000 — SmartSend Roofing "AI Scheduling Assistant + Predictive Workload Planner" v1
// Edge Function: /schedule/ai-recommend
// 
// This is the core AI scheduling engine that:
// - Estimates job duration using AI
// - Selects optimal crew
// - Suggests best available dates
// - Prevents overbooking
// - Considers weather forecasts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AIRecommendRequest {
  job_id: string;
  workspace_id: string;
  preferred_start_date?: string; // YYYY-MM-DD
  preferred_crew_id?: string;
  consider_weather?: boolean;
  lookahead_days?: number; // How many days ahead to look (default: 30)
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: AIRecommendRequest = await req.json();

    if (!body.job_id || !body.workspace_id) {
      return new Response(
        JSON.stringify({ error: "job_id and workspace_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // STEP 1: Get job details
    // ============================================================
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        workspace_id,
        title,
        job_value,
        status,
        official_squares,
        roof_squares,
        roof_pitch,
        skylights_count,
        chimneys_count,
        valleys_count,
        complexity_factor,
        decking_replacement_squares,
        material_type,
        address,
        preferred_start_date,
        scheduled_start_date,
        scheduled_end_date
      `)
      .eq("id", body.job_id)
      .eq("workspace_id", body.workspace_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // STEP 2: Get all active crews for this workspace
    // ============================================================
    const { data: crews, error: crewsError } = await supabase
      .from("crews")
      .select(`
        id,
        name,
        daily_capacity_squares,
        is_active
      `)
      .eq("workspace_id", body.workspace_id)
      .eq("is_active", true);

    if (crewsError || !crews || crews.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active crews found for this workspace" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // STEP 3: Estimate job duration using AI
    // ============================================================
    const squares = job.official_squares || job.roof_squares || 0;
    const pitch = job.roof_pitch || 0;
    const complexity = job.complexity_factor || 1.0;
    const skylights = job.skylights_count || 0;
    const chimneys = job.chimneys_count || 0;
    const valleys = job.valleys_count || 0;
    const deckingReplacement = job.decking_replacement_squares || 0;
    const materialType = job.material_type || "asphalt";

    let estimatedHours = 0;
    let estimatedDays = 0;
    let durationBreakdown: any = {};
    let durationConfidence = 0.7;

    // Use AI if available, otherwise use formula
    if (OPENAI_API_KEY && squares > 0) {
      try {
        const prompt = `Estimate the duration (in hours) for a roofing job with these parameters:
- Roof size: ${squares} squares
- Pitch: ${pitch}/12
- Complexity factor: ${complexity}
- Skylights: ${skylights}
- Chimneys: ${chimneys}
- Valleys: ${valleys}
- Decking replacement: ${deckingReplacement} squares
- Material type: ${materialType}
- Season: ${new Date().getMonth() >= 2 && new Date().getMonth() <= 4 ? "Spring" : new Date().getMonth() >= 5 && new Date().getMonth() <= 7 ? "Summer" : new Date().getMonth() >= 8 && new Date().getMonth() <= 10 ? "Fall" : "Winter"}

Consider:
- Standard workday is 8 hours
- Pitch affects difficulty (higher pitch = more time)
- Complexity features add time
- Decking replacement adds significant time
- Material type affects installation speed
- Season affects daylight hours and weather

Return ONLY a JSON object with:
{
  "estimated_hours": <number>,
  "estimated_days": <number>,
  "breakdown": {
    "base_hours": <number>,
    "pitch_multiplier": <number>,
    "complexity_hours": <number>,
    "features_hours": <number>,
    "decking_hours": <number>
  },
  "confidence": <number between 0 and 1>
}`;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are a roofing operations expert. Estimate job duration based on job parameters. Return only valid JSON.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.3,
          }),
        });

        const aiData = await response.json();
        const content = aiData.choices[0]?.message?.content;

        if (content) {
          try {
            const aiResult = JSON.parse(content);
            estimatedHours = aiResult.estimated_hours || 0;
            estimatedDays = aiResult.estimated_days || Math.ceil(estimatedHours / 8);
            durationBreakdown = aiResult.breakdown || {};
            durationConfidence = aiResult.confidence || 0.7;
          } catch (parseError) {
            console.error("Failed to parse AI response:", parseError);
            // Fall through to formula
          }
        }
      } catch (aiError) {
        console.error("AI estimation failed, using formula:", aiError);
        // Fall through to formula
      }
    }

    // Formula-based calculation (fallback or if no AI)
    if (estimatedHours === 0 && squares > 0) {
      const baseHours = (squares / 20) * 8; // Assume 20 squares/day default
      const pitchMultiplier = 1 + (pitch / 12) * 0.15;
      const complexityHours = (complexity - 1.0) * baseHours * 0.2;
      const featuresHours = (skylights * 0.5) + (chimneys * 0.3) + (valleys * 0.2);
      const deckingHours = deckingReplacement * 0.5; // 0.5 hours per square of decking

      estimatedHours = (baseHours * pitchMultiplier) + complexityHours + featuresHours + deckingHours;
      estimatedDays = Math.ceil(estimatedHours / 8);
      durationBreakdown = {
        base_hours: baseHours,
        pitch_multiplier: pitchMultiplier,
        complexity_hours: complexityHours,
        features_hours: featuresHours,
        decking_hours: deckingHours,
      };
      durationConfidence = 0.6;
    } else if (estimatedHours === 0) {
      // Default fallback
      estimatedHours = 16; // 2 days
      estimatedDays = 2;
      durationConfidence = 0.5;
    }

    // ============================================================
    // STEP 4: Evaluate each crew and find best match
    // ============================================================
    const lookaheadDays = body.lookahead_days || 30;
    const startDate = body.preferred_start_date 
      ? new Date(body.preferred_start_date)
      : new Date();
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + lookaheadDays);

    const crewEvaluations: any[] = [];

    for (const crew of crews) {
      // Skip if specific crew requested and this isn't it
      if (body.preferred_crew_id && crew.id !== body.preferred_crew_id) {
        continue;
      }

      // Get crew's existing schedule
      const { data: existingSchedules } = await supabase
        .from("crew_schedules")
        .select("id, job_id, start_date, end_date, estimated_duration")
        .eq("crew_id", crew.id)
        .eq("status", "scheduled")
        .gte("start_date", startDate.toISOString().split("T")[0])
        .lte("start_date", endDate.toISOString().split("T")[0]);

      // Calculate crew capacity
      const dailyCapacity = crew.daily_capacity_squares || 20;
      const dailyHours = 8;
      const weeklyCapacity = dailyHours * 5; // 5 days/week

      // Find best available date range
      const availableDates: any[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split("T")[0];
        const dayOfWeek = currentDate.getDay();

        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Check if crew is available on this date
        const hasConflict = existingSchedules?.some((schedule) => {
          const scheduleStart = new Date(schedule.start_date);
          const scheduleEnd = schedule.end_date ? new Date(schedule.end_date) : scheduleStart;
          return currentDate >= scheduleStart && currentDate <= scheduleEnd;
        });

        if (!hasConflict) {
          // Calculate how many consecutive days are available
          let consecutiveDays = 0;
          let checkDate = new Date(currentDate);
          let allAvailable = true;

          while (allAvailable && consecutiveDays < estimatedDays + 2) {
            const checkDateStr = checkDate.toISOString().split("T")[0];
            const checkDayOfWeek = checkDate.getDay();

            if (checkDayOfWeek === 0 || checkDayOfWeek === 6) {
              checkDate.setDate(checkDate.getDate() + 1);
              continue;
            }

            const hasConflictOnCheck = existingSchedules?.some((schedule) => {
              const scheduleStart = new Date(schedule.start_date);
              const scheduleEnd = schedule.end_date ? new Date(schedule.end_date) : scheduleStart;
              return checkDate >= scheduleStart && checkDate <= scheduleEnd;
            });

            if (hasConflictOnCheck) {
              allAvailable = false;
            } else {
              consecutiveDays++;
              checkDate.setDate(checkDate.getDate() + 1);
            }
          }

          if (consecutiveDays >= estimatedDays) {
            const endDateForSlot = new Date(currentDate);
            endDateForSlot.setDate(endDateForSlot.getDate() + estimatedDays - 1);

            availableDates.push({
              start_date: dateStr,
              end_date: endDateForSlot.toISOString().split("T")[0],
              consecutive_days: consecutiveDays,
            });
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Score this crew
      let score = 0;
      const reasons: string[] = [];

      // Prefer crews with higher capacity if job is large
      if (squares > 30 && dailyCapacity >= 25) {
        score += 20;
        reasons.push("high capacity for large job");
      }

      // Prefer crews with availability soon
      if (availableDates.length > 0) {
        const earliestDate = availableDates[0];
        const daysUntilAvailable = Math.ceil(
          (new Date(earliestDate.start_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilAvailable <= 7) {
          score += 30;
          reasons.push("available within 7 days");
        } else if (daysUntilAvailable <= 14) {
          score += 15;
          reasons.push("available within 14 days");
        }
      }

      // Prefer crews with fewer existing commitments
      const existingHours = existingSchedules?.reduce((sum, s) => sum + (s.estimated_duration || 0), 0) || 0;
      const workloadPercentage = (existingHours / (weeklyCapacity * 4)) * 100; // 4 weeks

      if (workloadPercentage < 50) {
        score += 20;
        reasons.push("low current workload");
      } else if (workloadPercentage < 75) {
        score += 10;
        reasons.push("moderate workload");
      }

      crewEvaluations.push({
        crew_id: crew.id,
        crew_name: crew.name,
        daily_capacity: dailyCapacity,
        score,
        reasons,
        available_dates: availableDates.slice(0, 5), // Top 5 options
        existing_workload_hours: existingHours,
        workload_percentage: workloadPercentage,
      });
    }

    // Sort crews by score
    crewEvaluations.sort((a, b) => b.score - a.score);
    const bestCrew = crewEvaluations[0];

    if (!bestCrew || bestCrew.available_dates.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No available crew slots found in the next " + lookaheadDays + " days",
          crew_evaluations: crewEvaluations,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // STEP 5: Check weather for recommended dates (if enabled)
    // ============================================================
    const recommendedDate = bestCrew.available_dates[0];
    let weatherRisk = "low";
    let weatherReasons: string[] = [];
    let weatherAdjustedDate = recommendedDate.start_date;

    if (body.consider_weather && OPENWEATHER_API_KEY && job.address) {
      try {
        // Extract zip code from address
        const zipMatch = job.address.match(/\b\d{5}\b/);
        if (zipMatch) {
          const weatherUrl = `https://api.openweathermap.org/data/2.5/forecast?zip=${zipMatch[0]},us&appid=${OPENWEATHER_API_KEY}&units=imperial`;
          const weatherResponse = await fetch(weatherUrl);
          
          if (weatherResponse.ok) {
            const weatherData = await weatherResponse.json();
            const targetDate = new Date(recommendedDate.start_date);
            
            // Find forecast for target date
            const forecasts = weatherData.list || [];
            for (const forecast of forecasts) {
              const forecastDate = new Date(forecast.dt * 1000);
              if (forecastDate.toDateString() === targetDate.toDateString()) {
                const precipitation = forecast.rain?.["3h"] || forecast.snow?.["3h"] || 0;
                const windSpeed = forecast.wind?.speed || 0;
                
                if (precipitation > 0.1 || windSpeed > 30) {
                  weatherRisk = "high";
                  if (precipitation > 0.1) weatherReasons.push("rain expected");
                  if (windSpeed > 30) weatherReasons.push("high winds");
                  
                  // Suggest next available date
                  if (bestCrew.available_dates.length > 1) {
                    weatherAdjustedDate = bestCrew.available_dates[1].start_date;
                  }
                } else if (precipitation > 0 || windSpeed > 20) {
                  weatherRisk = "medium";
                  weatherReasons.push("marginal conditions");
                }
                break;
              }
            }
          }
        }
      } catch (weatherError) {
        console.error("Weather check failed:", weatherError);
        // Continue without weather adjustment
      }
    }

    // ============================================================
    // STEP 6: Check for overbooking conflicts
    // ============================================================
    const finalStartDate = weatherAdjustedDate;
    const finalEndDate = recommendedDate.end_date;

    const { data: conflicts } = await supabase.rpc("detect_schedule_conflicts", {
      p_workspace_id: body.workspace_id,
      p_crew_id: bestCrew.crew_id,
      p_start_date: finalStartDate,
      p_end_date: finalEndDate,
      p_exclude_job_id: body.job_id,
    });

    const hasConflicts = conflicts && conflicts.length > 0;
    const conflictSeverity = hasConflicts
      ? conflicts.some((c: any) => c.severity === "high" || c.severity === "critical")
        ? "high"
        : "medium"
      : "none";

    // ============================================================
    // STEP 7: Calculate confidence score
    // ============================================================
    let confidence = durationConfidence;
    
    // Reduce confidence if conflicts exist
    if (hasConflicts) {
      confidence *= 0.7;
    }
    
    // Reduce confidence if weather risk is high
    if (weatherRisk === "high") {
      confidence *= 0.8;
    }
    
    // Increase confidence if crew has low workload
    if (bestCrew.workload_percentage < 50) {
      confidence = Math.min(confidence * 1.1, 0.95);
    }

    // ============================================================
    // STEP 8: Build reasoning JSON
    // ============================================================
    const reasoning = {
      duration_estimation: {
        method: OPENAI_API_KEY ? "ai" : "formula",
        estimated_hours: estimatedHours,
        estimated_days: estimatedDays,
        breakdown: durationBreakdown,
        confidence: durationConfidence,
      },
      crew_selection: {
        selected_crew_id: bestCrew.crew_id,
        selected_crew_name: bestCrew.crew_name,
        score: bestCrew.score,
        reasons: bestCrew.reasons,
        workload_percentage: bestCrew.workload_percentage,
        all_crew_scores: crewEvaluations.map((c) => ({
          crew_id: c.crew_id,
          crew_name: c.crew_name,
          score: c.score,
        })),
      },
      date_selection: {
        recommended_start: finalStartDate,
        recommended_end: finalEndDate,
        available_alternatives: bestCrew.available_dates.slice(1, 4),
        weather_risk: weatherRisk,
        weather_reasons: weatherReasons,
        weather_adjusted: weatherAdjustedDate !== recommendedDate.start_date,
      },
      conflict_analysis: {
        has_conflicts: hasConflicts,
        conflict_count: conflicts?.length || 0,
        conflict_severity: conflictSeverity,
        conflicts: conflicts || [],
      },
    };

    // ============================================================
    // STEP 9: Save recommendation to database
    // ============================================================
    const { data: recommendation, error: saveError } = await supabase
      .from("ai_scheduling_recommendations")
      .insert({
        job_id: body.job_id,
        workspace_id: body.workspace_id,
        recommended_start: finalStartDate,
        recommended_end: finalEndDate,
        recommended_crew: bestCrew.crew_id,
        confidence: confidence,
        reasoning: reasoning,
        estimated_duration_hours: estimatedHours,
        estimated_duration_days: estimatedDays,
        status: "pending",
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving recommendation:", saveError);
    }

    // ============================================================
    // STEP 10: Return response
    // ============================================================
    return new Response(
      JSON.stringify({
        success: true,
        recommendation: recommendation || {
          job_id: body.job_id,
          recommended_start: finalStartDate,
          recommended_end: finalEndDate,
          recommended_crew: bestCrew.crew_id,
          confidence: confidence,
        },
        estimated_duration: {
          hours: estimatedHours,
          days: estimatedDays,
          breakdown: durationBreakdown,
        },
        recommended_crew: {
          id: bestCrew.crew_id,
          name: bestCrew.crew_name,
          score: bestCrew.score,
          reasons: bestCrew.reasons,
        },
        recommended_dates: {
          start: finalStartDate,
          end: finalEndDate,
          alternatives: bestCrew.available_dates.slice(1, 4),
        },
        weather: {
          risk: weatherRisk,
          reasons: weatherReasons,
          adjusted: weatherAdjustedDate !== recommendedDate.start_date,
        },
        conflicts: {
          has_conflicts: hasConflicts,
          severity: conflictSeverity,
          count: conflicts?.length || 0,
          details: conflicts || [],
        },
        confidence: confidence,
        reasoning: reasoning,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in AI scheduling recommendation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































