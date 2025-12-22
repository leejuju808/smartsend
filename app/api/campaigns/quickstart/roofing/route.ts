import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { service, city, company, steps } = body;

  // Safety checks
  if (!service || !city || !company)
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );

  // 1. Generate campaign name
  const name = `${city} – ${service} ${steps}-Step`;

  // 2. Build template sequence
  const template = buildRoofingSequence({ service, city, company, steps });

  // 3. Insert campaign using MVP format
  const { data: newCampaign, error } = await supabase
    .from("campaigns")
    .insert({
      owner_id: user.id,
      name,
      goal: `roofing_quickstart_${service}`,
      sequence: template,
      status: "draft",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Quickstart create error:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }

  if (!newCampaign) {
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }

  // Mark campaign as created in onboarding
  await supabase
    .from("profiles")
    .update({ onboarding_campaign_created: true })
    .eq("id", user.id);

  return NextResponse.json({ id: newCampaign.id }, { status: 201 });
}

function buildRoofingSequence({
  service,
  city,
  company,
  steps,
}: {
  service: string;
  city: string;
  company: string;
  steps: string;
}) {
  const base = [
    {
      step: 1,
      subject: `Quick question about your roof in ${city}`,
      body: `Hi {{name}},\n\nThis is ${company}. We're helping several homeowners in ${city} with ${service}. If you need a fast, no-pressure quote, we can be there this week.\n\nWant me to send over some times?\n\n– ${company}`,
      delayDays: 0,
    },
    {
      step: 2,
      subject: `Still helping ${city} homeowners with ${service}`,
      body: `Hi {{name}},\n\nJust following up — we're still in ${city} this week doing ${service}.\n\nIf you want a quick estimate, it only takes 15 minutes. Happy to help.\n\n– ${company}`,
      delayDays: 2,
    },
    {
      step: 3,
      subject: `Availability this week in ${city} for roofing help`,
      body: `Hi {{name}},\n\nWe have a couple open spots left this week for homeowners needing ${service}.\n\nCan I book you in?\n\n– ${company}`,
      delayDays: 4,
    },
  ];

  if (steps === "3") return base;

  // Add aggressive steps 4 and 5 for storm work
  return [
    ...base,
    {
      step: 4,
      subject: `Helping storm-affected homes in ${city}`,
      body: `Hi {{name}},\n\nWe're inspecting storm damage and hail claims around ${city}. It's free and can save you thousands.\n\nWant us to swing by?\n\n– ${company}`,
      delayDays: 6,
    },
    {
      step: 5,
      subject: `Last call for ${service} inspections in ${city}`,
      body: `Hi {{name}},\n\nLast note from me — we're wrapping up our ${service} route in ${city}. If you need help, I can book you in before we leave.\n\n– ${company}`,
      delayDays: 8,
    },
  ];
}

