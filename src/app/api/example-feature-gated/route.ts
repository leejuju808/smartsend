import { NextRequest, NextResponse } from "next/server";
import { checkFeature } from "@/lib/featureGate";

// Example API route with feature gating
export async function POST(req: NextRequest) {
  try {
    const { workspace_id, ...otherData } = await req.json();
    
    if (!workspace_id) {
      return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
    }

    // Check if workspace has access to reply inbox feature
    const gate = await checkFeature(workspace_id, "reply_inbox");
    
    if (!gate.ok) {
      // Return appropriate error based on the reason
      switch (gate.reason) {
        case "billing_inactive":
          return NextResponse.json({ 
            error: "Subscription inactive", 
            code: "BILLING_INACTIVE",
            details: gate 
          }, { status: 402 });
          
        case "upgrade_required":
          return NextResponse.json({ 
            error: "Upgrade required", 
            code: "UPGRADE_REQUIRED",
            required_plan: gate.required,
            current_plan: gate.current_plan,
            details: gate 
          }, { status: 402 });
          
        case "seats_exceeded":
          return NextResponse.json({ 
            error: "Seat limit exceeded", 
            code: "SEATS_EXCEEDED",
            seats_in_use: gate.seats_in_use,
            seats_allowed: gate.seats_allowed,
            details: gate 
          }, { status: 402 });
          
        default:
          return NextResponse.json({ 
            error: "Access denied", 
            code: "ACCESS_DENIED",
            details: gate 
          }, { status: 403 });
      }
    }

    // Feature is available, proceed with the business logic
    // ... your actual API logic here ...
    
    return NextResponse.json({ 
      success: true, 
      message: "Reply inbox feature accessed successfully",
      billing_status: {
        plan: gate.current_plan,
        seats_in_use: gate.seats_in_use,
        seats_allowed: gate.seats_allowed
      }
    });
    
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Example of a simpler middleware approach
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspace_id = searchParams.get("workspace_id");
  
  if (!workspace_id) {
    return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
  }

  // Check feature access
  const gate = await checkFeature(workspace_id, "advanced_analytics");
  
  if (!gate.ok) {
    return NextResponse.json({ 
      error: "Feature not available", 
      reason: gate.reason,
      upgrade_required: gate.required 
    }, { status: 402 });
  }

  // Return analytics data
  return NextResponse.json({ 
    analytics: "Advanced analytics data here...",
    plan: gate.current_plan 
  });
}