import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";

// Get channel performance with caching (use materialized view)
const getCachedChannelPerformance = unstable_cache(
  async () => {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const [{ data: channels }, { data: campaigns }] = await Promise.all([
      supabase.from("channel_performance_mv").select("*").limit(100),
      supabase.from("channel_performance_mv").select("*").limit(100)
    ]);

    if (channels === null) {
      throw new Error("Failed to fetch channel performance");
    }

    return { 
      channels: channels || [], 
      campaigns: campaigns || [] 
    };
  },
  ["channel-performance"],
  { revalidate: 3600 }
);

export async function GET() {
  try {
    const data = await getCachedChannelPerformance();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
