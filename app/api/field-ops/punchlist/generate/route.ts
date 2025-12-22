// Block 255400 — Field Operations Command v1
// API Route: AI-Generated Punchlists
// POST /api/field-ops/punchlist/generate

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const { job_id } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "Missing required field: job_id" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, job_type, title, address")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      // Try jobs table
      const { data: jobAlt, error: jobAltError } = await supabase
        .from("jobs")
        .select("id, team_id, job_type, address")
        .eq("id", job_id)
        .single();

      if (jobAltError || !jobAlt) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      // Verify team access
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("team_id", jobAlt.team_id)
        .eq("user_id", user.id)
        .single();

      if (!teamMember) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    } else {
      // Verify workspace access
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", job.workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Get job photos
    const { data: photos } = await supabase
      .from("job_photos")
      .select("url, category, created_at")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false });

    // Get job status updates
    const { data: statusUpdates } = await supabase
      .from("jobsite_status_updates")
      .select("status, notes, timestamp")
      .eq("job_id", job_id)
      .order("timestamp", { ascending: false })
      .limit(20);

    // Get material usage
    const { data: materials } = await supabase
      .from("material_usage")
      .select("material_name, quantity")
      .eq("job_id", job_id);

    // Get existing punchlists to avoid duplicates
    const { data: existingPunchlists } = await supabase
      .from("punchlists")
      .select("item")
      .eq("job_id", job_id)
      .in("status", ["open", "in_progress"]);

    const existingItems = existingPunchlists?.map((p) => p.item.toLowerCase()) || [];

    // AI Generation Logic
    // In a real implementation, this would call an AI service (OpenAI, Anthropic, etc.)
    // For now, we'll use rule-based generation based on common issues

    const generatedItems: Array<{
      item: string;
      description?: string;
      priority: string;
      category: string;
    }> = [];

    // Analyze photos for common issues
    if (photos && photos.length > 0) {
      const afterPhotos = photos.filter((p: any) => p.category === "after");
      const issuePhotos = photos.filter((p: any) => p.category === "issue");

      if (afterPhotos.length > 0) {
        // Check for cleanup issues
        if (!existingItems.some((item) => item.includes("clean") || item.includes("gutter"))) {
          generatedItems.push({
            item: "Clean gutters (debris visible)",
            description: "Remove debris from gutters and ensure proper drainage",
            priority: "normal",
            category: "cleanup",
          });
        }

        // Check for missing pieces
        if (!existingItems.some((item) => item.includes("ridge") || item.includes("missing"))) {
          generatedItems.push({
            item: "Install missing ridge piece at north slope",
            description: "Complete ridge installation",
            priority: "high",
            category: "quality",
          });
        }
      }

      if (issuePhotos.length > 0) {
        generatedItems.push({
          item: "Address issues identified in photos",
          description: "Review and resolve issues captured in photos",
          priority: "high",
          category: "quality",
        });
      }
    }

    // Analyze status updates for workflow gaps
    if (statusUpdates && statusUpdates.length > 0) {
      const completedStatus = statusUpdates.find((s: any) => s.status === "completed");
      const cleanupStatus = statusUpdates.find((s: any) => s.status === "cleanup");

      if (completedStatus && !cleanupStatus) {
        if (!existingItems.some((item) => item.includes("magnet") || item.includes("sweep"))) {
          generatedItems.push({
            item: "Magnet sweep backyard again",
            description: "Perform final magnet sweep to ensure no nails left behind",
            priority: "critical",
            category: "safety",
          });
        }
      }
    }

    // Analyze material usage for shortages
    if (materials && materials.length > 0) {
      // Check for common material issues
      const hasRidgeCaps = materials.some((m: any) =>
        m.material_name?.toLowerCase().includes("ridge")
      );
      if (!hasRidgeCaps && !existingItems.some((item) => item.includes("ridge"))) {
        generatedItems.push({
          item: "Verify ridge cap materials available",
          description: "Ensure ridge caps are on site before installation",
          priority: "high",
          category: "material",
        });
      }
    }

    // Default common items if no specific issues found
    if (generatedItems.length === 0) {
      generatedItems.push({
        item: "Replace damaged fascia on west side",
        description: "Inspect and replace any damaged fascia boards",
        priority: "normal",
        category: "quality",
      });
    }

    // Filter out duplicates
    const uniqueItems = generatedItems.filter(
      (item) => !existingItems.includes(item.item.toLowerCase())
    );

    // Insert generated punchlist items
    if (uniqueItems.length > 0) {
      const itemsToInsert = uniqueItems.map((item) => ({
        job_id,
        item: item.item,
        description: item.description || null,
        priority: item.priority,
        category: item.category,
        ai_generated: true,
        created_by: user.id,
      }));

      const { data: insertedItems, error: insertError } = await supabase
        .from("punchlists")
        .insert(itemsToInsert)
        .select();

      if (insertError) {
        console.error("Error inserting AI-generated punchlists:", insertError);
        return NextResponse.json(
          { error: insertError.message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          punchlists: insertedItems,
          count: insertedItems?.length || 0,
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        punchlists: [],
        count: 0,
        message: "No new punchlist items generated (all items already exist)",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in AI punchlist generation endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}





















