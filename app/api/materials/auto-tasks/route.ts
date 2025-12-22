// Block 18300 — Material Detection Engine v1
// POST /api/materials/auto-tasks
// Automatically generates material-specific tasks based on detected materials

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

interface TaskSuggestion {
  title: string;
  description: string;
  urgency: "normal" | "urgent" | "critical";
  dueDays: number;
  taskType: string;
}

function generateMaterialTasks(intelligence: any): TaskSuggestion[] {
  const tasks: TaskSuggestion[] = [];

  if (!intelligence) return tasks;

  const materialType = intelligence.material_type;
  const ageCategory = intelligence.roof_age_category;
  const conditions = {
    granuleLoss: intelligence.granule_loss_detected,
    shingleCurl: intelligence.shingle_curl_detected,
    hailImpact: intelligence.hail_impact_marks,
    windUplift: intelligence.wind_uplift_detected,
  };

  // Asphalt shingle tasks
  if (materialType === 'asphalt_shingle') {
    if (ageCategory === '16_25_years' || ageCategory === '25_plus_years') {
      tasks.push({
        title: "Suggest replacement - Architectural shingles approaching end of life",
        description: `Roof age (${ageCategory.replace(/_/g, '-')}) indicates replacement may be needed. Check for granule loss and shingle condition.`,
        urgency: "normal",
        dueDays: 7,
        taskType: "follow_up",
      });
    }

    if (conditions.hailImpact) {
      tasks.push({
        title: "Storm inspection after hail damage detected",
        description: "Hail impact marks detected. Schedule inspection to assess damage and potential insurance claim opportunity.",
        urgency: "urgent",
        dueDays: 1,
        taskType: "inspection",
      });
    }

    if (conditions.granuleLoss) {
      tasks.push({
        title: "Check granule loss - may indicate aging roof",
        description: "Granule loss detected. Assess shingle condition and discuss replacement timeline with homeowner.",
        urgency: "normal",
        dueDays: 3,
        taskType: "follow_up",
      });
    }
  }

  // Metal roofing tasks
  if (materialType === 'metal') {
    tasks.push({
      title: "Check metal roof seams for damage",
      description: "Inspect standing seam or panel connections for impact dents, loose fasteners, or seam separation.",
      urgency: "normal",
      dueDays: 5,
      taskType: "inspection",
    });

    if (conditions.hailImpact) {
      tasks.push({
        title: "Metal roof hail inspection - dents may be hidden",
        description: "Metal roofing often hides hail dents. Perform thorough inspection to identify all damage for insurance claim.",
        urgency: "urgent",
        dueDays: 1,
        taskType: "inspection",
      });
    }
  }

  // Tile roofing tasks
  if (materialType === 'tile') {
    if (ageCategory === '16_25_years' || ageCategory === '25_plus_years') {
      tasks.push({
        title: "Tile roof over 20 years - check underlayment age",
        description: "Tile roofs over 20 years often need underlayment refresh even if tiles look good. Inspect underlayment condition.",
        urgency: "normal",
        dueDays: 7,
        taskType: "inspection",
      });
    }

    tasks.push({
      title: "Check for cracked tiles",
      description: "Inspect tile roof for cracked, broken, or missing tiles. Tile repairs may be needed.",
      urgency: "normal",
      dueDays: 5,
      taskType: "inspection",
    });
  }

  // Flat roof tasks
  if (materialType?.startsWith('flat_')) {
    tasks.push({
      title: "Check flat roof membrane seams",
      description: "Inspect TPO/EPDM membrane seams for lifts, separations, or ponding water issues.",
      urgency: "normal",
      dueDays: 5,
      taskType: "inspection",
    });

    if (materialType === 'flat_tpo') {
      tasks.push({
        title: "TPO inspection for cold climate compatibility",
        description: "TPO roofs in cold climates may have compatibility issues. Check for seam problems and membrane condition.",
        urgency: "normal",
        dueDays: 7,
        taskType: "inspection",
      });
    }

    if (materialType === 'flat_epdm') {
      tasks.push({
        title: "EPDM roof - check for shrinkage",
        description: "EPDM roofs can shrink over time. Inspect for shrinkage at edges and seams.",
        urgency: "normal",
        dueDays: 5,
        taskType: "inspection",
      });
    }
  }

  // General tasks based on conditions
  if (conditions.windUplift) {
    tasks.push({
      title: "URGENT: Wind uplift detected - schedule inspection ASAP",
      description: "Wind uplift damage detected. This is urgent - missing or lifted shingles can lead to leaks.",
      urgency: "critical",
      dueDays: 0,
      taskType: "inspection",
    });
  }

  if (intelligence.storm_vulnerability === 'high') {
    tasks.push({
      title: "High storm vulnerability - discuss replacement options",
      description: "Roof has high storm vulnerability. Discuss replacement options and insurance coverage with homeowner.",
      urgency: "normal",
      dueDays: 7,
      taskType: "follow_up",
    });
  }

  if (intelligence.insurance_angle === 'strong') {
    tasks.push({
      title: "Strong insurance angle - prepare claim documentation",
      description: "Strong insurance claim potential detected. Prepare documentation and discuss claim process with homeowner.",
      urgency: "normal",
      dueDays: 3,
      taskType: "follow_up",
    });
  }

  // Component-specific tasks
  if (intelligence.has_skylights) {
    tasks.push({
      title: "Check skylight age and condition",
      description: "Skylight detected. Inspect for age mismatch with roof and potential replacement needs.",
      urgency: "normal",
      dueDays: 7,
      taskType: "inspection",
    });
  }

  return tasks;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { contactId } = body;

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }

    // Get material intelligence
    const { data: intelligence, error: intelError } = await supabase
      .from("material_intelligence")
      .select("*")
      .eq("contact_id", contactId)
      .maybeSingle();

    if (intelError) {
      console.error("Error fetching material intelligence:", intelError);
      return NextResponse.json(
        { error: "Failed to fetch material intelligence" },
        { status: 500 }
      );
    }

    if (!intelligence) {
      return NextResponse.json({
        success: true,
        tasks: [],
        message: "No material intelligence found for this contact",
      });
    }

    // Generate tasks
    const taskSuggestions = generateMaterialTasks(intelligence);

    // Get contact and workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id, org_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Create tasks
    const createdTasks = [];
    for (const taskSuggestion of taskSuggestions) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + taskSuggestion.dueDays);

      const { data: task, error: taskError } = await supabase
        .from("smartsend_tasks")
        .insert({
          workspace_id: contact.workspace_id,
          org_id: contact.org_id,
          contact_id: contactId,
          user_id: user.id,
          task_type: taskSuggestion.taskType,
          urgency: taskSuggestion.urgency,
          status: taskSuggestion.urgency === "critical" ? "today" : "upcoming",
          title: taskSuggestion.title,
          description: taskSuggestion.description,
          due_at: dueDate.toISOString(),
          auto_generated: true,
          auto_source: "material_detection",
          created_by: user.id,
        })
        .select()
        .single();

      if (taskError) {
        console.error("Error creating task:", taskError);
      } else {
        createdTasks.push(task);
      }
    }

    return NextResponse.json({
      success: true,
      tasks: createdTasks,
      suggestions: taskSuggestions,
    });
  } catch (error: any) {
    console.error("Error generating material tasks:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































