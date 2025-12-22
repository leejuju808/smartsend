"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

type Scope = "inbox" | "leads";

export default function SavedViewBuilderSheet({
  accountId,
  scope = "inbox",
  onRun,
}: {
  accountId: string;
  scope?: Scope;
  onRun?: (rows: any[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [intent, setIntent] = React.useState<string>("");
  const [sinceDays, setSinceDays] = React.useState<number>(7);
  const [scoreMin, setScoreMin] = React.useState<number>(60);
  const [tech, setTech] = React.useState<string>("");
  const [industry, setIndustry] = React.useState<string>("");
  const [domain, setDomain] = React.useState<string>("");
  const [empMin, setEmpMin] = React.useState<number>(50);
  const [paused, setPaused] = React.useState<boolean>(false);
  const isInbox = scope === "inbox";

  function filtersJson() {
    const f: Record<string, unknown> = {};

    if (isInbox) {
      if (intent) f.intent = intent;
      if (sinceDays) f.since_days = sinceDays;
      if (scoreMin) f.score_min = scoreMin;
      f.paused = paused;
    }

    if (tech) f.tech = tech;
    if (industry) f.industry_contains = industry;
    if (domain) f.domain = domain;
    if (empMin) f.employees_min = empMin;

    return f;
  }

  async function runNow() {
    const filters = filtersJson();
    const response = await fetch("/api/saved-views/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        scope,
        filters,
        limit: isInbox ? 200 : 500,
      }),
    });

    const payload = await response.json();
    if (payload.ok && onRun) {
      onRun(payload.rows);
    }
  }

  async function save() {
    const filters = filtersJson();
    const response = await fetch("/api/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        name: name || defaultName(),
        scope,
        filters,
      }),
    });

    const payload = await response.json();
    if (payload.ok) {
      setOpen(false);
    }
  }

  function defaultName() {
    const parts: string[] = [];

    if (isInbox) {
      parts.push("Hot");
      if (intent) parts.push(intent);
      parts.push(`≥${scoreMin}`);
      parts.push(`${sinceDays}d`);
    } else {
      parts.push("ICP");
      if (tech) parts.push(tech);
      if (empMin) parts.push(`≥${empMin}`);
    }

    return parts.join(" ");
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Saved View Builder
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[420px] sm:w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Build a {scope === "inbox" ? "Replies" : "Leads"} View</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={defaultName()} />
          </div>

          {isInbox && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Intent</Label>
                  <Select value={intent} onValueChange={setIntent}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      <SelectItem value="positive">positive</SelectItem>
                      <SelectItem value="meeting_intent">meeting_intent</SelectItem>
                      <SelectItem value="ooo">ooo</SelectItem>
                      <SelectItem value="bounce">bounce</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Since (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={sinceDays}
                    onChange={(event) => setSinceDays(Number(event.target.value || 7))}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Score ≥ {scoreMin}</Label>
                <Slider min={0} max={100} step={5} value={[scoreMin]} onValueChange={(value) => setScoreMin(value[0])} />
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={paused} onCheckedChange={setPaused} />
                <span className="text-xs">Only paused threads</span>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tech contains</Label>
              <Input
                value={tech}
                onChange={(event) => setTech(event.target.value)}
                placeholder="hubspot, salesforce, etc."
              />
            </div>
            <div>
              <Label className="text-xs">Industry contains</Label>
              <Input
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                placeholder="SaaS, Healthcare"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Employees ≥</Label>
              <Input
                type="number"
                min={0}
                value={empMin}
                onChange={(event) => setEmpMin(Number(event.target.value || 0))}
              />
            </div>
            <div>
              <Label className="text-xs">Domain</Label>
              <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="acme.com" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={runNow}>
              Run
            </Button>
            <Button size="sm" variant="secondary" onClick={save}>
              Save View
            </Button>
          </div>

          <div className="pt-2 text-xs opacity-70">Filters → JSON → server RPC. Safe, explainable & fast.</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

