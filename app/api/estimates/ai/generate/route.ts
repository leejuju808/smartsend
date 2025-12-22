import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createClient, getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const RoofType = z.enum(["Asphalt", "Metal", "Tile", "Flat"]);
const Scope = z.enum(["Repair", "Partial", "Full Replacement"]);

const bodySchema = z.object({
  customer_name: z.string().min(1),
  address: z.string().min(1),
  roof_type: RoofType,
  roof_size_value: z.number().positive(),
  roof_size_unit: z.enum(["squares", "sqft"]),
  scope: Scope,
  tear_off_required: z.boolean().optional(),
  decking_repair: z.boolean().optional(),
  insurance_job: z.boolean().optional(),
  notes: z.string().optional(),
});

function dollars(n: number) {
  return `$${n.toFixed(2)}`;
}

function normalizeSquares(value: number, unit: "squares" | "sqft") {
  return unit === "squares" ? value : value / 100;
}

function computePricing(input: z.infer<typeof bodySchema>) {
  const squaresRaw = normalizeSquares(input.roof_size_value, input.roof_size_unit);
  const squares = Math.max(0.25, Number.isFinite(squaresRaw) ? squaresRaw : 0);

  const materialPerSq: Record<z.infer<typeof RoofType>, number> = {
    Asphalt: 350,
    Metal: 1050,
    Tile: 1250,
    Flat: 650,
  };
  const laborPerSq: Record<z.infer<typeof RoofType>, number> = {
    Asphalt: 275,
    Metal: 450,
    Tile: 500,
    Flat: 325,
  };

  const isRepair = input.scope === "Repair";
  const isFull = input.scope === "Full Replacement";

  const baseMaterials = squares * materialPerSq[input.roof_type];
  const baseLabor = squares * laborPerSq[input.roof_type];

  const serviceMinimum = isRepair ? 450 : 0;
  const tearOff = input.tear_off_required && !isRepair ? squares * 75 : 0;
  const disposal = !isRepair ? squares * 20 : 75;
  const permits = isFull && squares >= 10 ? 250 : 0;
  const deckingAllowance = input.decking_repair ? 500 : 0;

  const subtotal = Math.max(serviceMinimum, baseMaterials + baseLabor + tearOff + disposal + permits + deckingAllowance);
  const taxes = 0;
  const total = subtotal + taxes;

  return {
    squares: Number(squares.toFixed(2)),
    sizeText:
      input.roof_size_unit === "squares"
        ? `${input.roof_size_value} squares`
        : `${input.roof_size_value} sq ft`,
    lineItems: [
      { category: "Materials", description: `${input.roof_type} roofing materials`, amount: baseMaterials },
      { category: "Labor", description: `${input.scope} labor`, amount: baseLabor },
      ...(tearOff > 0 ? [{ category: "Tear-off", description: "Remove existing roofing and prep surface", amount: tearOff }] : []),
      { category: "Disposal", description: "Haul-away and disposal of debris", amount: disposal },
      ...(permits > 0 ? [{ category: "Permits", description: "Permitting allowance (if required by your municipality)", amount: permits }] : []),
      ...(deckingAllowance > 0
        ? [{ category: "Labor", description: "Decking repair allowance (as needed)", amount: deckingAllowance }]
        : []),
    ].map((x) => ({ ...x, amount: Number(x.amount.toFixed(2)) })),
    subtotal: Number(subtotal.toFixed(2)),
    taxes,
    total: Number(total.toFixed(2)),
    timeline: isRepair
      ? { start: "3–5 business days after approval", duration: "Same day (typically 2–6 hours)" }
      : isFull
      ? { start: "3–5 business days after approval", duration: "1–2 days" }
      : { start: "3–5 business days after approval", duration: "1 day" },
    warranty: isRepair
      ? {
          workmanshipYears: 1,
          materialWarranty: "Manufacturer warranty varies by existing product",
        }
      : {
          workmanshipYears: 5,
          materialWarranty:
            input.roof_type === "Asphalt"
              ? "Manufacturer material warranty (commonly 25–50 years, product-dependent)"
              : input.roof_type === "Metal"
              ? "Manufacturer material warranty (commonly 30–50 years, product-dependent)"
              : input.roof_type === "Tile"
              ? "Manufacturer material warranty (commonly 40–50+ years, product-dependent)"
              : "Manufacturer material warranty (commonly 10–30 years, product-dependent)",
        },
  };
}

const SYSTEM_PROMPT = [
  "You are a Roofing Estimate Specialist.",
  "",
  "Your job is to generate a clean, professional, homeowner-ready roofing estimate.",
  "",
  "Rules:",
  "- No jargon",
  "- Clear itemized pricing",
  "- Transparent totals",
  "- Conservative timelines",
  "- Professional contractor tone",
  "- US roofing standards only",
  "",
  "You must include:",
  "1. Job overview",
  "2. Itemized table (materials, labor, disposal)",
  "3. Timeline (start → completion)",
  "4. Warranty section (workmanship + materials)",
  "5. Total price",
  "6. Next steps for homeowner approval",
  "",
  "Format cleanly.",
  "This estimate may be sent directly to a homeowner.",
].join("\n");

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured." }, { status: 501 });
    }

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const input = bodySchema.parse(json);

    // Resolve scope IDs (best-effort; generation can still work without them)
    const workspaceId = await getActiveWorkspaceId();
    const sb = await getServerSupabase();
    const { data: membership } = await sb
      .from("roofing_company_members")
      .select("roofing_company_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const companyId = membership?.roofing_company_id ?? null;

    const pricing = computePricing(input);

    const itemizedRows = pricing.lineItems
      .map((li) => `| ${li.category} | ${li.description} | ${dollars(li.amount)} |`)
      .join("\n");

    const userPrompt = [
      "Generate the estimate using the EXACT format below.",
      "Use the EXACT dollar amounts provided. Do not invent additional fees or line items beyond what is provided.",
      "",
      "INPUTS:",
      `Customer Name: ${input.customer_name}`,
      `Property Address: ${input.address}`,
      `Roof Type: ${input.roof_type}`,
      `Roof Size: ${pricing.sizeText}`,
      `Scope: ${input.scope}`,
      `Tear-off required: ${input.tear_off_required ? "Yes" : "No"}`,
      `Decking repair: ${input.decking_repair ? "Yes" : "No"}`,
      `Insurance job: ${input.insurance_job ? "Yes" : "No"}`,
      input.notes?.trim() ? `Notes: ${input.notes.trim()}` : "",
      "",
      "PRICING (USE THESE NUMBERS):",
      `Subtotal: ${dollars(pricing.subtotal)}`,
      `Taxes: ${dollars(pricing.taxes)} (if applicable)`,
      `Total: ${dollars(pricing.total)}`,
      "",
      "ITEMIZED LINE ITEMS (USE THESE NUMBERS):",
      pricing.lineItems.map((li) => `- ${li.category}: ${li.description} — ${dollars(li.amount)}`).join("\n"),
      "",
      "OUTPUT FORMAT (FIXED):",
      "Section 1 — Job Overview",
      "",
      "Plain English summary of work.",
      "",
      "Section 2 — Itemized Estimate (TABLE)",
      "",
      "| Category | Description | Amount |",
      "|---|---|---:|",
      itemizedRows,
      "",
      "Section 3 — Timeline",
      "",
      `Start: ${pricing.timeline.start}`,
      `Duration: ${pricing.timeline.duration}`,
      "",
      "Section 4 — Warranty",
      "",
      `Workmanship: ${pricing.warranty.workmanshipYears} year(s)`,
      `Manufacturer material warranty: ${pricing.warranty.materialWarranty}`,
      "",
      "Section 5 — Total Investment",
      "",
      `Subtotal: ${dollars(pricing.subtotal)}`,
      `Taxes (if applicable): ${dollars(pricing.taxes)}`,
      `Total: ${dollars(pricing.total)}`,
      "",
      "Section 6 — Approval CTA",
      "",
      "Simple next-step language.",
      "",
      "If insurance job is Yes, include a short, homeowner-friendly note that pricing is based on scope listed and insurer approval may affect final scope.",
      "",
      "Return ONLY the estimate text (no JSON, no extra commentary).",
      "",
      `INTERNAL CONTEXT (do not mention): workspace_id=${workspaceId ?? "null"} company_id=${companyId ?? "null"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const estimate_text = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!estimate_text) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    }

    return NextResponse.json({
      estimate_text,
      total_price: pricing.total,
      subtotal: pricing.subtotal,
      taxes: pricing.taxes,
      computed: {
        squares: pricing.squares,
        size: pricing.sizeText,
        workspace_id: workspaceId,
        company_id: companyId,
      },
      line_items: pricing.lineItems,
    });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid request", details: err.issues }, { status: 400 });
    }
    console.error("Create Estimate generate error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}











