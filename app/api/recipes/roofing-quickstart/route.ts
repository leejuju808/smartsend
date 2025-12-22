import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type Goal =
  | "book_inspections"
  | "revive_old_estimates"
  | "reactivate_past_customers";

type SequenceStep = {
  subject: string;
  body: string;
  delay: number; // days after previous
};

function buildSequence(opts: {
  company_name: string;
  city: string;
  primary_service: string;
  avg_job_value: number | null;
  goal: Goal;
}): { name: string; goalLabel: string; steps: SequenceStep[] } {
  const { company_name, city, primary_service, avg_job_value, goal } = opts;

  const avgText =
    avg_job_value && avg_job_value > 0
      ? `Most of the roofs we replace are in the $${avg_job_value.toLocaleString()} range, but we always give a written estimate before you decide anything.`
      : `We'll give you a clear written estimate before you decide anything.`;

  if (goal === "book_inspections") {
    const name = `${city} Homeowner Roof Inspection Campaign`;
    const goalLabel = "Book free roof inspections with local homeowners";

    const steps: SequenceStep[] = [
      {
        subject: `${city} homeowner? Quick roof check from ${company_name}`,
        delay: 0,
        body: `Hi {{first_name}},

I'm ${company_name ? "with " + company_name : "a local roofing contractor"} here in ${city}. We're helping homeowners with ${primary_service || "roof inspections and replacement"} before small issues turn into leaks.

We're currently offering a free, no-pressure roof check for homes in your area. It usually takes 20–30 minutes and you'll get a simple summary of what we see.

Would you like to:

A) Book a free inspection this week  
B) Get a quick ballpark over email first  

Reply with A or B and I'll take care of the rest.

Best,  
{{sender_first_name}}  
${company_name}
`,
      },
      {
        subject: `Still happy to check your roof (free, no pressure)`,
        delay: 3,
        body: `Hi {{first_name}},

Just circling back on the free roof inspection I mentioned — we still have a few openings in ${city} this week.

${avgText}

If you'd like to grab a spot, just reply with:

- Your address  
- A preferred day/time window  

and I'll confirm the inspection.

Best,  
{{sender_first_name}}  
${company_name}
`,
      },
      {
        subject: `Last call for a quick roof check in ${city}`,
        delay: 4,
        body: `Hi {{first_name}},

I know you're busy, so this will be my last follow-up.

If you'd like a quick, no-pressure roof check in ${city}, just reply to this email with:

- Your address  
- The best phone number to confirm  

We'll handle the rest and you'll know exactly where your roof stands.

Thanks for your time either way,  
{{sender_first_name}}  
${company_name}
`,
      },
    ];

    return { name, goalLabel, steps };
  }

  if (goal === "revive_old_estimates") {
    const name = `${city} Old Estimate Follow-Up Campaign`;
    const goalLabel = "Revive old roofing estimates and turn them into jobs";

    const steps: SequenceStep[] = [
      {
        subject: `Quick follow-up on your past roof estimate`,
        delay: 0,
        body: `Hi {{first_name}},

A while back, you received a roof estimate from ${company_name} for work at your property in ${city}. I wanted to check in and see where things landed on your end.

Sometimes timing, budget, or other projects get in the way — totally understandable.

If you're still considering roof work, we can:

- Re-validate or update your old estimate  
- Review any questions you had  
- Look at options to phase the work if needed  

Would you like to set up a quick call, or would you prefer we resend the estimate details over email?

Best,  
{{sender_first_name}}  
${company_name}
`,
      },
      {
        subject: `Do you still need roof work at your ${city} home?`,
        delay: 4,
        body: `Hi {{first_name}},

Just checking back in on your previous roof estimate with ${company_name}.

With material costs and weather changing, this could be a good time to lock in a plan, even if you're not ready to start tomorrow.

If you hit reply and say "still interested," I'll pull up your old estimate and send you a quick status with options.

Thanks,  
{{sender_first_name}}  
${company_name}
`,
      },
      {
        subject: `One last check-in on your roof project`,
        delay: 5,
        body: `Hi {{first_name}},

This will be my last follow-up regarding your past roof estimate from ${company_name}.

If you've already taken care of the roof, just let us know and we'll update our notes.

If you still haven't done the work and want a fresh set of eyes (or updated pricing), reply to this email and we'll make it easy for you.

Appreciate your time,  
{{sender_first_name}}  
${company_name}
`,
      },
    ];

    return { name, goalLabel, steps };
  }

  // reactivate_past_customers
  const name = `${city} Past Customer Check-In Campaign`;
  const goalLabel = "Reactivate past roofing customers and add additional work";

  const steps: SequenceStep[] = [
    {
      subject: `Quick check-in from ${company_name}`,
      delay: 0,
      body: `Hi {{first_name}},

It's been a little while since we last did roof work for you here in ${city}, and I wanted to quickly check in.

We like to make sure our past customers are still in good shape — especially after the kind of weather we've had lately.

If you've noticed any of this:

- Granules in the gutters  
- Stains on ceilings or walls  
- Shingles that look lifted or missing  

it might be worth a quick look before it turns into a larger issue.

If you'd like, we can:

- Do a quick visual check  
- Quote additional work (gutters, ventilation, etc.) if needed  

Anything you want us to take a look at?

Best,  
{{sender_first_name}}  
${company_name}
`,
    },
    {
      subject: `Need us to take another look at your roof?`,
      delay: 5,
      body: `Hi {{first_name}},

Just following up on my last note.

We've been helping a lot of past customers in ${city} with small follow-up items: ventilation tweaks, gutter changes, small repairs, etc.

If something on the roof has been bugging you — even if it's minor — reply to this email with a quick description and we'll let you know the best next step.

Thanks again for trusting ${company_name},  
{{sender_first_name}}
`,
    },
  ];

  return { name, goalLabel, steps };
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  let body: {
    company_name?: string;
    city?: string;
    primary_service?: string;
    avg_job_value?: number | null;
    goal?: Goal;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const company_name = (body.company_name || "").trim() || "your roofing company";
  const city = (body.city || "").trim() || "your area";
  const primary_service =
    (body.primary_service || "").trim() || "roof inspections and replacement";
  const avg_job_value =
    typeof body.avg_job_value === "number" ? body.avg_job_value : null;
  const goal: Goal = body.goal || "book_inspections";

  const { name, goalLabel, steps } = buildSequence({
    company_name,
    city,
    primary_service,
    avg_job_value,
    goal,
  });

  // Convert to MVP format (same as /api/campaigns MVP format)
  const formattedSequence = steps.map((step, index) => ({
    step: index + 1,
    subject: step.subject || "",
    body: step.body || "",
    delayDays: step.delay || 0,
  }));

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      owner_id: user.id,
      name,
      goal: goalLabel,
      status: "draft",
      sequence: formattedSequence,
    })
    .select("id")
    .single();

  if (error || !campaign) {
    console.error("Quickstart campaign create error:", error);
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

  return NextResponse.json(
    {
      campaign_id: campaign.id,
    },
    { status: 201 }
  );
}

