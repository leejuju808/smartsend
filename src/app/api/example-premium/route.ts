import { isPro } from "@/lib/isPro";

export async function POST(req: Request) {
  try {
    const { user_id, action } = await req.json();
    
    if (!user_id || !action) {
      return new Response("Missing user_id or action", { status: 400 });
    }

    // Check if user has Pro plan
    if (!(await isPro(user_id))) {
      return new Response("Pro plan required", { status: 402 });
    }

    // Pro user - proceed with premium action
    const result = await performPremiumAction(action);
    
    return Response.json({ 
      success: true, 
      message: "Premium action completed",
      result 
    });
    
  } catch (error) {
    console.error("Premium API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user_id = url.searchParams.get("user_id");
  
  if (!user_id) {
    return new Response("Missing user_id", { status: 400 });
  }

  // Check if user has Pro plan
  if (!(await isPro(user_id))) {
    return new Response("Pro plan required", { status: 402 });
  }

  // Return premium data
  return Response.json({
    success: true,
    premiumData: {
      analytics: "Advanced analytics data",
      features: ["Feature A", "Feature B", "Feature C"],
      limits: "Higher limits"
    }
  });
}

// Mock function for demonstration
async function performPremiumAction(action: string) {
  // Simulate some premium action
  await new Promise(resolve => setTimeout(resolve, 100));
  return { action, timestamp: new Date().toISOString() };
} 