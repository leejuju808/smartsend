// Block 20290 — SmartSend Inbox Homeowner Profile Header v1
// One powerful header that pulls everything together: person + house + roof + tags + insurance + heat.

"use client";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

interface HomeownerIntelCardProps {
  convo: any; // inbox_conversation record (optionally with tags)
}

function computeJobSource(raw: string | null | undefined): {
  primary: string;
  secondary: string | null;
} {
  const source = (raw || "").trim();
  const s = source.toLowerCase();

  const primary = "SmartSend Outreach";
  if (!source) return { primary, secondary: null };

  const isSmartSend =
    s.includes("smartsend") ||
    s.includes("cold email") ||
    s.includes("email outreach") ||
    s.includes("outreach") ||
    s.includes("campaign") ||
    s.includes("sequence") ||
    s.includes("follow-up") ||
    s.includes("autopilot");

  if (isSmartSend) return { primary, secondary: null };

  return { primary, secondary: source };
}

function stageLabel(stage?: string | null) {
  switch (stage) {
    case "new":
      return "New lead";
    case "contacted":
      return "Contacted";
    case "inspection_scheduled":
      return "Inspection scheduled";
    case "estimate_sent":
      return "Estimate sent";
    case "negotiation":
      return "In negotiation";
    case "won":
      return "Job won";
    case "lost":
      return "Job lost";
    default:
      return "Lead";
  }
}

function stageBadgeClass(stage?: string | null) {
  switch (stage) {
    case "new":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "contacted":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "inspection_scheduled":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "estimate_sent":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "negotiation":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "won":
      return "bg-emerald-600 text-white border-emerald-600";
    case "lost":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function engagementLabel(level?: string | null) {
  switch (level) {
    case "hot":
      return "Hot";
    case "warm":
      return "Warm";
    case "cold":
      return "Cold";
    default:
      return "Unknown";
  }
}

function engagementColor(level?: string | null) {
  switch (level) {
    case "hot":
      return "text-red-600";
    case "warm":
      return "text-amber-600";
    case "cold":
      return "text-slate-500";
    default:
      return "text-slate-400";
  }
}

export default function HomeownerIntelCard({ convo }: HomeownerIntelCardProps) {
  const createdAt = convo.created_at ? new Date(convo.created_at) : null;
  const prettyCreated = createdAt
    ? dateFmt.format(createdAt)
    : null;

  const rawSource = (convo.lead_source || convo.created_channel || null) as
    | string
    | null;
  const { primary: jobSourcePrimary, secondary: jobSourceSecondary } =
    computeJobSource(rawSource);

  const fullAddress =
    convo.property_address ||
    [convo.city, convo.state, convo.zip].filter(Boolean).join(", ");

  const tags = (convo.tags || []) as
    | {
        id: string;
        label: string;
        color?: string | null;
        category?: string | null;
      }[]
    | [];

  const insuranceBadge = (() => {
    if (!convo.is_insurance_claim) return null;
    const carrier = convo.insurance_carrier || "Insurance claim";
    const status = convo.insurance_status || "In progress";
    return `${carrier} · ${status}`;
  })();

  const roofSnippet = (() => {
    const parts: string[] = [];
    if (convo.roof_material) {
      const label =
        convo.roof_material === "asphalt"
          ? "Asphalt"
          : convo.roof_material === "metal"
          ? "Metal"
          : convo.roof_material === "tile"
          ? "Tile"
          : convo.roof_material === "wood"
          ? "Wood"
          : convo.roof_material === "flat"
          ? "Flat"
          : "Roof";
      parts.push(label);
    }
    if (convo.roof_age_estimated != null) {
      parts.push(`${convo.roof_age_estimated} yrs`);
    }
    if (convo.roof_last_replacement_year) {
      parts.push(`since ${convo.roof_last_replacement_year}`);
    }
    return parts.join(" · ");
  })();

  const estimatedJobValue =
    typeof convo.estimated_job_value === "number"
      ? convo.estimated_job_value
      : null;

  const engagementScore =
    typeof convo.engagement_score === "number"
      ? convo.engagement_score
      : null;

  const hasPhone = !!convo.homeowner_phone;
  const hasEmail = !!convo.homeowner_email;

  return (
    <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-2">
      {/* Top row: name + stage + source */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">
              {convo.homeowner_name || "Unnamed homeowner"}
            </p>
            {convo.lead_stage && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${stageBadgeClass(
                  convo.lead_stage
                )}`}
              >
                {stageLabel(convo.lead_stage)}
              </span>
            )}
          </div>
          {fullAddress && (
            <p className="text-[11px] text-gray-500">
              {fullAddress}
            </p>
          )}
          <p className="text-[10px] text-gray-400">
            Job Source: {jobSourcePrimary}
            {jobSourceSecondary ? ` · ${jobSourceSecondary}` : ""}
            {prettyCreated && ` · Added ${prettyCreated}`}
          </p>
        </div>

        <div className="text-right space-y-0.5">
          {engagementScore != null && (
            <p
              className={`text-[11px] font-semibold ${engagementColor(
                convo.engagement_level
              )}`}
            >
              {engagementLabel(convo.engagement_level)} ·{" "}
              {engagementScore} pts
            </p>
          )}
          {estimatedJobValue != null && (
            <p className="text-[11px] text-gray-600">
              Est. job:{" "}
              <span className="font-semibold">
                $
                {estimatedJobValue.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tags.map((t) => {
            const colorClass =
              t.color === "red"
                ? "border-red-200 text-red-700 bg-red-50"
                : t.color === "amber"
                ? "border-amber-200 text-amber-700 bg-amber-50"
                : t.color === "green"
                ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                : t.color === "blue"
                ? "border-blue-200 text-blue-700 bg-blue-50"
                : "border-slate-200 text-slate-700 bg-slate-50";

            return (
              <span
                key={t.id}
                className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] ${colorClass}`}
              >
                {t.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Middle row: roof + insurance + property quick info */}
      <div className="grid grid-cols-1 gap-2 border-t pt-2 mt-1 text-[11px] text-gray-600">
        <div className="flex flex-wrap gap-3">
          {roofSnippet && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase text-gray-400">
                Roof
              </span>
              <span className="text-gray-700 font-medium">
                {roofSnippet}
              </span>
            </div>
          )}
          {convo.property_sqft && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase text-gray-400">
                Sqft
              </span>
              <span className="text-gray-700 font-medium">
                {convo.property_sqft}
              </span>
            </div>
          )}
          {(convo.property_bedrooms || convo.property_bathrooms) && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase text-gray-400">
                Layout
              </span>
              <span className="text-gray-700 font-medium">
                {convo.property_bedrooms
                  ? `${convo.property_bedrooms} bd`
                  : ""}
                {convo.property_bedrooms && convo.property_bathrooms
                  ? " · "
                  : ""}
                {convo.property_bathrooms
                  ? `${convo.property_bathrooms} ba`
                  : ""}
              </span>
            </div>
          )}
        </div>

        {insuranceBadge && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase text-gray-400">
              Insurance
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
              {insuranceBadge}
            </span>
          </div>
        )}
      </div>

      {/* Contact row */}
      {(hasEmail || hasPhone) && (
        <div className="border-t pt-2 mt-1 flex flex-col gap-1 text-[11px]">
          {hasEmail && (
            <a
              href={`mailto:${convo.homeowner_email}`}
              className="text-gray-700 hover:underline break-all"
            >
              {convo.homeowner_email}
            </a>
          )}
          {hasPhone && (
            <a
              href={`tel:${convo.homeowner_phone}`}
              className="text-gray-700 hover:underline"
            >
              {convo.homeowner_phone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
