import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

function getUserId(req: Request) { 
  return new URL(req.url).searchParams.get("userId"); 
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { emails } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: "Emails array is required" }, { status: 400 });
    }

    // Ensure ownership of the sequence
    const { data: seq } = await supabaseAdmin
      .from("sequences")
      .select("id")
      .eq("id", params.id)
      .eq("user_id", userId)
      .single();
      
    if (!seq) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    // Check if sequence has steps
    const { data: steps } = await supabaseAdmin
      .from("sequence_steps")
      .select("id")
      .eq("sequence_id", params.id)
      .order("step_number");
      
    if (!steps || steps.length === 0) {
      return NextResponse.json({ error: "Sequence has no steps" }, { status: 400 });
    }

    // Enroll each email
    const enrollments = [];
    for (const email of emails) {
      const { data: enrollment, error } = await supabaseAdmin
        .from("sequence_enrollments")
        .upsert({
          sequence_id: params.id,
          email: email.toLowerCase().trim(),
          current_step: 0,
          last_sent: null
        }, {
          onConflict: "sequence_id,email"
        })
        .select()
        .single();

      if (error) {
        console.error(`Failed to enroll ${email}:`, error);
        continue;
      }
      
      enrollments.push(enrollment);
    }

    return NextResponse.json({ 
      ok: true, 
      enrolled: enrollments.length,
      message: `Successfully enrolled ${enrollments.length} contacts`
    });

  } catch (error) {
    console.error("Error enrolling contacts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Ensure ownership of the sequence
    const { data: seq } = await supabaseAdmin
      .from("sequences")
      .select("id")
      .eq("id", params.id)
      .eq("user_id", userId)
      .single();
      
    if (!seq) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    // Get all enrollments for this sequence
    const { data: enrollments, error } = await supabaseAdmin
      .from("sequence_enrollments")
      .select("*")
      .eq("sequence_id", params.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching enrollments:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      enrollments: enrollments || []
    });

  } catch (error) {
    console.error("Error fetching enrollments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

