"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Vendor = {
  key: string;
  display_name: string;
  default_priority: number;
  enabled: boolean;
};

type Route = {
  account_id: string;
  vendor_key: string;
  weight: number;
  priority: number;
  enabled: boolean;
};

type RoutingState = Record<
  string,
  {
    weight: number;
    priority: number;
    enabled: boolean;
  }
>;

type VendorsResponse = {
  vendors: Vendor[];
  routes: Route[];
};

export function VendorsPanel() {
  const [data, setData] = React.useState<VendorsResponse>({ vendors: [], routes: [] });
  const [routes, setRoutes] = React.useState<RoutingState>({});
  const [kv, setKv] = React.useState<Record<string, string>>({ api_key: "" });
  const [loading, setLoading] = React.useState(false);
  const [savingRoutes, setSavingRoutes] = React.useState(false);
  const [savingSecret, setSavingSecret] = React.useState<string | null>(null);

  React.useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/vendors/routing");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Unable to load vendors");
      }
      const payload = (await res.json()) as VendorsResponse;
      setData({
        vendors: payload.vendors ?? [],
        routes: payload.routes ?? [],
      });
      const map: RoutingState = {};
      for (const vendor of payload.vendors ?? []) {
        const existing = (payload.routes ?? []).find((r) => r.vendor_key === vendor.key);
        map[vendor.key] = {
          weight: existing?.weight ?? 100,
          priority: existing?.priority ?? vendor.default_priority ?? 100,
          enabled: existing?.enabled ?? vendor.enabled ?? true,
        };
      }
      setRoutes(map);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }

  function updateRoute(vendorKey: string, updates: Partial<RoutingState[string]>) {
    setRoutes((prev) => {
      const current = prev[vendorKey] ?? { weight: 100, priority: 100, enabled: true };
      return {
        ...prev,
        [vendorKey]: { ...current, ...updates },
      };
    });
  }

  async function saveRoutes() {
    try {
      setSavingRoutes(true);
      const payload = Object.entries(routes).map(([vendor_key, config]) => ({
        vendor_key,
        weight: Number.isFinite(config.weight) ? config.weight : 100,
        priority: Number.isFinite(config.priority) ? config.priority : 100,
        enabled: config.enabled,
      }));

      const res = await fetch("/api/vendors/routing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to save routing");
      }
      toast.success("Routing saved");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save routing");
    } finally {
      setSavingRoutes(false);
    }
  }

  function setEvenSplit() {
    const vendors = data.vendors ?? [];
    if (!vendors.length) return;
    const weight = 100;
    const next: RoutingState = {};
    for (const vendor of vendors) {
      next[vendor.key] = {
        weight,
        priority: vendor.default_priority ?? 100,
        enabled: routes[vendor.key]?.enabled ?? vendor.enabled ?? true,
      };
    }
    setRoutes(next);
  }

  async function saveSecret(vendorKey: string) {
    try {
      setSavingSecret(vendorKey);
      const res = await fetch("/api/vendors/secret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vendor_key: vendorKey, kv }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to save secret");
      }
      toast.success("Secret saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save secret");
    } finally {
      setSavingSecret(null);
    }
  }

  const vendors = data.vendors ?? [];

  return (
    <Card className="p-4 space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium">Vendors</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={setEvenSplit} disabled={loading || savingRoutes}>
            Even Split
          </Button>
          <Button size="sm" onClick={saveRoutes} disabled={loading || savingRoutes}>
            {savingRoutes ? "Saving..." : "Save Routing"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {vendors.map((vendor) => {
          const current = routes[vendor.key] ?? { weight: 100, priority: vendor.default_priority ?? 100, enabled: true };
          return (
            <div key={vendor.key} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{vendor.display_name}</div>
                  <div className="text-muted-foreground text-xs">{vendor.key}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Enabled</span>
                  <Switch checked={current.enabled} onCheckedChange={(val) => updateRoute(vendor.key, { enabled: val })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Weight</span>
                  <Input
                    type="number"
                    min={0}
                    value={current.weight ?? ""}
                    onChange={(event) => updateRoute(vendor.key, { weight: Number(event.target.value || 0) })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Priority</span>
                  <Input
                    type="number"
                    min={0}
                    value={current.priority ?? ""}
                    onChange={(event) => updateRoute(vendor.key, { priority: Number(event.target.value || 0) })}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveSecret(vendor.key)}
                  disabled={savingSecret === vendor.key}
                >
                  {savingSecret === vendor.key ? "Saving..." : "Save Secret"}
                </Button>
              </div>
            </div>
          );
        })}
        {!vendors.length && !loading ? (
          <div className="text-xs text-muted-foreground">No vendors configured.</div>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="font-medium">Set API Key</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="api_key"
            value={kv.api_key ?? ""}
            onChange={(event) => setKv((prev) => ({ ...prev, api_key: event.target.value }))}
          />
          <Input
            placeholder="base_url (optional)"
            value={kv.base_url ?? ""}
            onChange={(event) => setKv((prev) => ({ ...prev, base_url: event.target.value }))}
          />
        </div>
      </div>
    </Card>
  );
}

