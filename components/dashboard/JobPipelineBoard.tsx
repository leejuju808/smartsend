"use client";

// Block 21722 — SmartSend Roofing Job Pipeline "Money Board" v1
import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PipelineData = {
  new_count: number;
  working_count: number;
  booked_count: number;
  lost_count: number;
  cold_count: number;
  new_value: number;
  working_value: number;
  booked_value: number;
  lost_value: number;
  cold_value: number;
  pipeline_value: number;
  won_value: number;
};

export function JobPipelineBoard() {
  const [data, setData] = React.useState<PipelineData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchPipeline = async () => {
      try {
        const res = await fetch("/api/owner/pipeline");
        if (!res.ok) throw new Error("Failed to load pipeline");
        const json = await res.json();
        setData(json.data ?? null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchPipeline();
  }, []);

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Job Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Loading money board…
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Job Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          No leads yet. Once SmartSend starts generating leads and bookings,
          your pipeline money will show here.
        </CardContent>
      </Card>
    );
  }

  const currency = (v: number) => `$${Math.round(v).toLocaleString()}`;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Job Pipeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top row: big picture */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <PipelineStat
            label="Pipeline value"
            value={currency(data.pipeline_value)}
            sub={`${data.new_count + data.working_count} leads`}
            variant="pipeline"
          />
          <PipelineStat
            label="Booked value"
            value={currency(data.won_value)}
            sub={`${data.booked_count} jobs`}
            variant="booked"
          />
          <PipelineStat
            label="New leads"
            value={data.new_count.toString()}
            sub={currency(data.new_value)}
            variant="new"
          />
          <PipelineStat
            label="Working leads"
            value={data.working_count.toString()}
            sub={currency(data.working_value)}
            variant="working"
          />
        </div>

        {/* Second row: losses + cold */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 text-xs">
          <MiniStat
            label="Lost"
            value={`${data.lost_count} leads`}
            valueSub={currency(data.lost_value)}
          />
          <MiniStat
            label="Cold"
            value={`${data.cold_count} leads`}
            valueSub={currency(data.cold_value)}
          />
          <MiniStat
            label="Total tracked"
            value={`${data.new_count + data.working_count + data.booked_count + data.lost_count + data.cold_count} leads`}
            valueSub={currency(
              data.new_value +
                data.working_value +
                data.booked_value +
                data.lost_value +
                data.cold_value
            )}
          />
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          SmartSend estimates job value from your leads and bookings so you can see, at a glance,
          how much money is in play and how much has already been won.
        </p>
      </CardContent>
    </Card>
  );
}

type PipelineStatProps = {
  label: string;
  value: string;
  sub?: string;
  variant?: "pipeline" | "booked" | "new" | "working";
};

function PipelineStat({ label, value, sub, variant }: PipelineStatProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 text-xs",
        variant === "pipeline" &&
          "bg-yellow-50/80 dark:bg-yellow-900/20 border-yellow-200/70 dark:border-yellow-800",
        variant === "booked" &&
          "bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-200/70 dark:border-emerald-800"
      )}
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

type MiniStatProps = {
  label: string;
  value: string;
  valueSub?: string;
};

function MiniStat({ label, value, valueSub }: MiniStatProps) {
  return (
    <div className="rounded-xl border p-2.5 text-xs">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
      {valueSub && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{valueSub}</p>
      )}
    </div>
  );
}











































