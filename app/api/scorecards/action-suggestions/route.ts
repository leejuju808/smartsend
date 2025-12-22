// Block 24700 — SmartSend Roofing Supplier & Crew Scorecard v1
// API Route: GET /api/scorecards/action-suggestions
// Returns AI-generated action suggestions based on scorecard performance

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const workspaceId = workspaceMember.workspace_id;

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entity_type"); // 'crew' or 'supplier'
    const entityId = searchParams.get("entity_id");
    const status = searchParams.get("status") || "active"; // active, acknowledged, dismissed, resolved
    const priority = searchParams.get("priority"); // low, medium, high, urgent

    // Build query
    let query = supabase
      .from("scorecard_action_suggestions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", status)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    const { data: suggestions, error } = await query;

    if (error) {
      console.error("Error fetching action suggestions:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch action suggestions" },
        { status: 500 }
      );
    }

    // Generate suggestions if none exist (AI coaching logic)
    if (!suggestions || suggestions.length === 0) {
      const generatedSuggestions = await generateActionSuggestions(
        supabase,
        workspaceId,
        entityType,
        entityId
      );

      return NextResponse.json({
        suggestions: generatedSuggestions,
        count: generatedSuggestions.length,
      });
    }

    return NextResponse.json({
      suggestions: suggestions || [],
      count: suggestions?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/scorecards/action-suggestions:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Generate AI action suggestions based on scorecard performance
async function generateActionSuggestions(
  supabase: any,
  workspaceId: string,
  entityType?: string | null,
  entityId?: string | null
): Promise<any[]> {
  const suggestions: any[] = [];

  // Generate crew suggestions
  if (!entityType || entityType === "crew") {
    const { data: crewScorecards } = await supabase
      .from("crew_scorecards")
      .select(`
        *,
        crews (
          id,
          name
        )
      `)
      .eq("workspace_id", workspaceId);

    if (crewScorecards) {
      for (const sc of crewScorecards) {
        if (entityId && sc.crew_id !== entityId) continue;

        const crew = sc.crews;
        const overallScore = parseFloat(sc.overall_score);
        const onTimeScore = parseFloat(sc.on_time_performance_score);
        const issueRateScore = parseFloat(sc.issue_rate_score);
        const durationScore = parseFloat(sc.duration_accuracy_score);
        const docScore = parseFloat(sc.documentation_quality_score);

        // Low on-time performance
        if (onTimeScore < 70) {
          suggestions.push({
            entity_type: "crew",
            entity_id: sc.crew_id,
            suggestion_type: "warning",
            title: `${crew?.name || "This crew"} has repeated late arrivals`,
            description: `On-time performance score is ${onTimeScore.toFixed(0)}. Consider reassignment or warning.`,
            priority: onTimeScore < 50 ? "urgent" : "high",
            related_score_category: "on_time_performance",
            related_score_value: onTimeScore,
            status: "active",
          });
        }

        // High issue rate
        if (issueRateScore < 70) {
          suggestions.push({
            entity_type: "crew",
            entity_id: sc.crew_id,
            suggestion_type: "warning",
            title: `${crew?.name || "This crew"} has a high issue rate`,
            description: `Issue rate score is ${issueRateScore.toFixed(0)}. Review recent issues and consider additional training.`,
            priority: issueRateScore < 50 ? "urgent" : "high",
            related_score_category: "issue_rate",
            related_score_value: issueRateScore,
            status: "active",
          });
        }

        // Excellent documentation
        if (docScore >= 90 && overallScore >= 85) {
          suggestions.push({
            entity_type: "crew",
            entity_id: sc.crew_id,
            suggestion_type: "praise",
            title: `${crew?.name || "This crew"} has excellent documentation quality`,
            description: `Documentation quality score is ${docScore.toFixed(0)}. Consider assigning them to complex jobs.`,
            priority: "low",
            related_score_category: "documentation_quality",
            related_score_value: docScore,
            status: "active",
          });
        }

        // Slow crew
        if (durationScore < 70) {
          suggestions.push({
            entity_type: "crew",
            entity_id: sc.crew_id,
            suggestion_type: "recommendation",
            title: `${crew?.name || "This crew"} is slower than estimated`,
            description: `Duration accuracy score is ${durationScore.toFixed(0)}. Review scheduling estimates or crew capacity.`,
            priority: "medium",
            related_score_category: "duration_accuracy",
            related_score_value: durationScore,
            status: "active",
          });
        }
      }
    }
  }

  // Generate supplier suggestions
  if (!entityType || entityType === "supplier") {
    const { data: supplierScorecards } = await supabase
      .from("supplier_scorecards")
      .select(`
        *,
        suppliers (
          id,
          name
        )
      `)
      .eq("workspace_id", workspaceId);

    if (supplierScorecards) {
      for (const sc of supplierScorecards) {
        if (entityId && sc.supplier_id !== entityId) continue;

        const supplier = sc.suppliers;
        const overallScore = parseFloat(sc.overall_score);
        const accuracyScore = parseFloat(sc.delivery_accuracy_score);
        const onTimeScore = parseFloat(sc.on_time_delivery_score);
        const resolutionScore = parseFloat(sc.issue_resolution_speed_score);

        // Late deliveries
        if (onTimeScore < 70) {
          const lateCount = sc.late_deliveries_count || 0;
          suggestions.push({
            entity_type: "supplier",
            entity_id: sc.supplier_id,
            suggestion_type: "warning",
            title: `${supplier?.name || "This supplier"} has had ${lateCount} late deliveries`,
            description: `On-time delivery score is ${onTimeScore.toFixed(0)}. Monitor carefully.`,
            priority: onTimeScore < 50 ? "urgent" : "high",
            related_score_category: "on_time_delivery",
            related_score_value: onTimeScore,
            status: "active",
          });
        }

        // Perfect accuracy
        if (accuracyScore >= 95 && overallScore >= 90) {
          suggestions.push({
            entity_type: "supplier",
            entity_id: sc.supplier_id,
            suggestion_type: "praise",
            title: `${supplier?.name || "This supplier"} has perfect accuracy`,
            description: `Delivery accuracy score is ${accuracyScore.toFixed(0)}. Consider shifting more orders to them.`,
            priority: "low",
            related_score_category: "delivery_accuracy",
            related_score_value: accuracyScore,
            status: "active",
          });
        }

        // Slow issue resolution
        if (resolutionScore < 70) {
          suggestions.push({
            entity_type: "supplier",
            entity_id: sc.supplier_id,
            suggestion_type: "recommendation",
            title: `${supplier?.name || "This supplier"} is slow to resolve issues`,
            description: `Issue resolution speed score is ${resolutionScore.toFixed(0)}. Consider discussing response time expectations.`,
            priority: "medium",
            related_score_category: "issue_resolution_speed",
            related_score_value: resolutionScore,
            status: "active",
          });
        }
      }
    }
  }

  // Insert suggestions into database
  if (suggestions.length > 0) {
    await supabase.from("scorecard_action_suggestions").insert(suggestions);
  }

  return suggestions;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { suggestion_id, action } = body; // action: 'acknowledge', 'dismiss', 'resolve'

    if (!suggestion_id || !action) {
      return NextResponse.json(
        { error: "suggestion_id and action are required" },
        { status: 400 }
      );
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (action === "acknowledge") {
      updateData.status = "acknowledged";
      updateData.acknowledged_at = new Date().toISOString();
      updateData.acknowledged_by = user.id;
    } else if (action === "dismiss") {
      updateData.status = "dismissed";
    } else if (action === "resolve") {
      updateData.status = "resolved";
    } else {
      return NextResponse.json(
        { error: "Invalid action. Must be 'acknowledge', 'dismiss', or 'resolve'" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("scorecard_action_suggestions")
      .update(updateData)
      .eq("id", suggestion_id)
      .select()
      .single();

    if (error) {
      console.error("Error updating suggestion:", error);
      return NextResponse.json(
        { error: error.message || "Failed to update suggestion" },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestion: data });
  } catch (error: any) {
    console.error("Error in POST /api/scorecards/action-suggestions:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































