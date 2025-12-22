// Block 18900 — SmartSend Roof Age Verifier v1
// GET /api/roofage/{contactId}
// Returns roof age data for a contact

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { calculateRoofAgeForContact } from "@/lib/ai/roofAgeVerifier";

/**
 * Auto-create tasks based on roof age bands
 */
async function createRoofAgeTasks(
  supabase: ReturnType<typeof createSupabaseServer>,
  contactId: string,
  workspaceId: string,
  roofAgeResult: any
) {
  const ageMedian = roofAgeResult.estimatedAgeMedian;
  const tasksToCreate: Array<{ title: string; description: string; priority: string; dueDays: number }> = [];

  // Age 15+ → Create "Ask about leaks" and "Offer inspection" tasks
  if (ageMedian >= 15) {
    tasksToCreate.push({
      title: "Ask about leaks",
      description: `Roof age is ${ageMedian.toFixed(1)} years. Check for leaks and water damage.`,
      priority: "medium",
      dueDays: 3,
    });
    tasksToCreate.push({
      title: "Offer inspection",
      description: `Roof age is ${ageMedian.toFixed(1)} years. Offer full roof assessment.`,
      priority: "high",
      dueDays: 1,
    });
  }

  // Age 20+ → Create "Replacement opportunity" task
  if (ageMedian >= 20) {
    tasksToCreate.push({
      title: "Replacement opportunity",
      description: `Roof age is ${ageMedian.toFixed(1)} years. High replacement potential. Prepare replacement quote.`,
      priority: "high",
      dueDays: 2,
    });
  }

  // Age 25+ → Create "Emergency follow-up" task
  if (ageMedian >= 25) {
    tasksToCreate.push({
      title: "Emergency follow-up",
      description: `Roof age is ${ageMedian.toFixed(1)} years. Roof considered expired. Urgent replacement needed.`,
      priority: "urgent",
      dueDays: 0,
    });
  }

  // Get workspace owner for task assignment
  const { data: workspaceOwner } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("role", "owner")
    .limit(1)
    .single();

  const taskOwnerId = workspaceOwner?.user_id || null;

  // Create tasks (check if they already exist to avoid duplicates)
  for (const task of tasksToCreate) {
    // Check if similar task already exists
    const { data: existingTasks } = await supabase
      .from("tasks_v3")
      .select("id")
      .eq("contact_id", contactId)
      .eq("workspace_id", workspaceId)
      .ilike("title", `%${task.title}%`)
      .eq("status", "open")
      .limit(1);

    if (existingTasks && existingTasks.length > 0) {
      continue; // Skip if task already exists
    }

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + task.dueDays);

    await supabase
      .from("tasks_v3")
      .insert({
        workspace_id: workspaceId,
        user_id: taskOwnerId,
        contact_id: contactId,
        task_type: "follow_up",
        priority: task.priority as any,
        status: "open",
        title: task.title,
        description: task.description,
        due_at: dueAt.toISOString(),
        auto_generated: true,
        auto_source: "roof_age_verifier",
        metadata: {
          roof_age: ageMedian,
          age_band: roofAgeResult.ageBand,
          replacement_probability: roofAgeResult.replacementProbability,
        },
      });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { contactId: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: profile } = await supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .single();

    const workspaceId = profile?.workspace_id;
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const contactId = params.contactId;

    // Check if contact exists and belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Get existing roof age data
    const { data: existingData } = await supabase
      .from("roof_age_data")
      .select("*")
      .eq("contact_id", contactId)
      .single();

    // Get roof age sources
    const { data: sources } = await supabase
      .from("roof_age_sources")
      .select("*")
      .eq("contact_id", contactId)
      .eq("is_active", true)
      .order("source_weight", { ascending: false });

    // If data exists and is recent (< 24 hours), return cached data
    if (existingData) {
      const lastCalculated = new Date(existingData.last_calculated_at);
      const hoursSinceCalculation = (Date.now() - lastCalculated.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceCalculation < 24) {
        return NextResponse.json({
          ...existingData,
          sources: sources || [],
        });
      }
    }

    // Calculate roof age (or recalculate if stale)
    const result = await calculateRoofAgeForContact(supabase, contactId, workspaceId);

    // Save roof age data
    const { data: savedData, error: saveError } = await supabase
      .from("roof_age_data")
      .upsert({
        contact_id: contactId,
        workspace_id: workspaceId,
        estimated_age_min: result.estimatedAgeMin,
        estimated_age_max: result.estimatedAgeMax,
        estimated_age_median: result.estimatedAgeMedian,
        confidence_score: result.confidenceScore,
        age_band: result.ageBand,
        replacement_probability: result.replacementProbability,
        insurance_feasibility: result.insuranceFeasibility,
        material_confirmed: result.materialConfirmed,
        storm_impact: result.stormImpact,
        recommended_action: result.recommendedAction,
        reasoning_summary: result.reasoningSummary,
        last_calculated_at: new Date().toISOString(),
      }, {
        onConflict: 'contact_id',
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving roof age data:', saveError);
    }

    // Save roof age sources
    if (result.sources.length > 0) {
      // Deactivate old sources
      await supabase
        .from("roof_age_sources")
        .update({ is_active: false })
        .eq("contact_id", contactId);

      // Insert new sources
      const sourcesToInsert = result.sources.map(source => ({
        contact_id: contactId,
        workspace_id: workspaceId,
        source_type: source.sourceType,
        source_data: source.sourceData,
        age_estimate_min: source.ageEstimateMin,
        age_estimate_max: source.ageEstimateMax,
        age_estimate_median: source.ageEstimateMedian,
        source_weight: source.sourceWeight,
        source_confidence: source.sourceConfidence,
        is_active: true,
      }));

      const { error: sourcesError } = await supabase
        .from("roof_age_sources")
        .insert(sourcesToInsert);

      if (sourcesError) {
        console.error('Error saving roof age sources:', sourcesError);
      }
    }

    // Save calculation history
    await supabase
      .from("roof_age_calculation_history")
      .insert({
        contact_id: contactId,
        workspace_id: workspaceId,
        calculation_inputs: {
          contactId,
          workspaceId,
        },
        calculated_age_min: result.estimatedAgeMin,
        calculated_age_max: result.estimatedAgeMax,
        calculated_age_median: result.estimatedAgeMedian,
        calculated_confidence: result.confidenceScore,
        source_contributions: result.sources.map(s => ({
          sourceType: s.sourceType,
          weight: s.sourceWeight,
          confidence: s.sourceConfidence,
          ageEstimate: s.ageEstimateMedian,
        })),
        calculation_method: 'weighted_average',
        calculation_version: 1,
      });

    // Update contact's roof_age_years field
    await supabase
      .from("contacts")
      .update({
        roof_age_years: Math.round(result.estimatedAgeMedian),
      })
      .eq("id", contactId);

    // Auto-create tasks based on roof age bands
    await createRoofAgeTasks(supabase, contactId, workspaceId, result);

    return NextResponse.json({
      ...(savedData || {
        contact_id: contactId,
        workspace_id: workspaceId,
        estimated_age_min: result.estimatedAgeMin,
        estimated_age_max: result.estimatedAgeMax,
        estimated_age_median: result.estimatedAgeMedian,
        confidence_score: result.confidenceScore,
        age_band: result.ageBand,
        replacement_probability: result.replacementProbability,
        insurance_feasibility: result.insuranceFeasibility,
        material_confirmed: result.materialConfirmed,
        storm_impact: result.stormImpact,
        recommended_action: result.recommendedAction,
        reasoning_summary: result.reasoningSummary,
      }),
      sources: result.sources,
    });
  } catch (error: any) {
    console.error("Error calculating roof age:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate roof age" },
      { status: 500 }
    );
  }
}

