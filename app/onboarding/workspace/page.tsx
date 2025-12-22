"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export default function WorkspaceOnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [teamSize, setTeamSize] = useState("solo");
  const [useCase, setUseCase] = useState("roofing_outreach");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
  };

  const uploadLogo = async () => {
    if (!logoFile) return null;
    const formData = new FormData();
    formData.append("file", logoFile);
    const res = await fetch("/api/onboarding/workspace/logo", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url as string;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      let logoUrl: string | undefined;
      if (logoFile) {
        logoUrl = await uploadLogo() ?? undefined;
      }

      const res = await fetch("/api/onboarding/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          timezone,
          teamSize,
          useCase,
          logoUrl,
        }),
      });

      if (!res.ok) {
        console.error("Failed to save workspace");
        setLoading(false);
        return;
      }

      const data = await res.json();
      router.push(data.next ?? "/onboarding/connect-email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto my-10 space-y-6 p-6 border rounded-2xl shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Set up your company</h1>
          <p className="text-sm text-muted-foreground">
            SmartSend reaches homeowners in your city who are likely to need roof work. When they respond, SmartSend follows up and shows you who wants an estimate. You respond and close the job.
          </p>
          <div className="text-xs text-muted-foreground space-y-1 pt-1">
            <div>Roofing companies use SmartSend to stay booked.</div>
            <div>Average homeowners responding: 8–12%</div>
            <div>Most jobs close within 7–14 days</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Company name</Label>
            <Input
              id="name"
              placeholder="Acme Roofing"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Team size</Label>
              <Select value={teamSize} onValueChange={setTeamSize}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team size" />
                  <SelectContent>
                    <SelectItem value="solo">Just me</SelectItem>
                    <SelectItem value="2-5">2–5 people</SelectItem>
                    <SelectItem value="5-10">5–10 people</SelectItem>
                    <SelectItem value="10+">10+ people</SelectItem>
                  </SelectContent>
                </SelectTrigger>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                  <SelectContent>
                    <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                    <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                    <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                    <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                  </SelectContent>
                </SelectTrigger>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Primary use case</Label>
            <Select value={useCase} onValueChange={setUseCase}>
              <SelectTrigger>
                <SelectValue placeholder="Select use case" />
                <SelectContent>
                  <SelectItem value="roofing_outreach">Homeowner outreach</SelectItem>
                  <SelectItem value="storm_followups">Storm follow-ups</SelectItem>
                  <SelectItem value="estimate_followups">Estimate follow-ups</SelectItem>
                  <SelectItem value="re_engagement">Re-engage old homeowners</SelectItem>
                </SelectContent>
              </SelectTrigger>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Workspace logo (optional)</Label>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full border flex items-center justify-center overflow-hidden">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-muted-foreground">Logo</span>
                )}
              </div>
              <Input type="file" accept="image/*" onChange={handleLogoChange} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Saving..." : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

