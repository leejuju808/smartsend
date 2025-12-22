"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";

type Inbox = {
  id: string;
  domain_id: string;
  email: string;
  provider: "gmail" | "outlook" | "smtp";
  daily_limit: number;
  warmup_enabled: boolean;
  connected: boolean;
  domain?: {
    domain: string;
  };
};

type Domain = {
  id: string;
  domain: string;
};

export default function InboxesSection() {
  const [inboxes, setInboxes] = React.useState<Inbox[]>([]);
  const [domains, setDomains] = React.useState<Domain[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [showAddForm, setShowAddForm] = React.useState(false);
  
  const [formData, setFormData] = React.useState({
    domain_id: "",
    email: "",
    provider: "gmail" as "gmail" | "outlook" | "smtp",
    daily_limit: 100,
    warmup_enabled: false,
  });

  const loadData = React.useCallback(async () => {
    try {
      const [domainsRes, inboxesRes] = await Promise.all([
        fetch("/api/domains/list"),
        fetch("/api/inboxes/list"),
      ]);

      if (domainsRes.ok) {
        const domainsData = await domainsRes.json();
        setDomains(domainsData.domains || []);
      }

      if (inboxesRes.ok) {
        const inboxesData = await inboxesRes.json();
        setInboxes(inboxesData.inboxes || []);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const addInbox = async () => {
    if (!formData.domain_id || !formData.email) {
      toast.error("Please fill in all required fields");
      return;
    }

    setAdding(true);
    try {
      const response = await fetch("/api/inboxes/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add inbox");
      }

      toast.success("Inbox added successfully");
      setShowAddForm(false);
      setFormData({
        domain_id: "",
        email: "",
        provider: "gmail",
        daily_limit: 100,
        warmup_enabled: false,
      });
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to add inbox");
    } finally {
      setAdding(false);
    }
  };

  const updateInbox = async (inboxId: string, updates: Partial<Inbox>) => {
    try {
      const response = await fetch(`/api/inboxes/${inboxId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update inbox");
      }

      toast.success("Inbox updated");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to update inbox");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Loading inboxes...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Inboxes</CardTitle>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? "Cancel" : "Add Inbox"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddForm && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Domain</label>
                <Select
                  value={formData.domain_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, domain_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {domains.map((domain) => (
                      <SelectItem key={domain.id} value={domain.id}>
                        {domain.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Provider</label>
                <Select
                  value={formData.provider}
                  onValueChange={(value: "gmail" | "outlook" | "smtp") =>
                    setFormData({ ...formData, provider: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="outlook">Outlook</SelectItem>
                    <SelectItem value="smtp">SMTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Daily Limit</label>
                <Input
                  type="number"
                  value={formData.daily_limit}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      daily_limit: parseInt(e.target.value) || 100,
                    })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.warmup_enabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, warmup_enabled: checked })
                }
              />
              <label className="text-sm font-medium">Enable Warmup</label>
            </div>
            <Button onClick={addInbox} disabled={adding}>
              {adding ? "Adding..." : "Add Inbox"}
            </Button>
          </div>
        )}

        {inboxes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No inboxes added yet. Add your first inbox to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {inboxes.map((inbox) => (
              <div
                key={inbox.id}
                className="flex items-center justify-between border rounded-lg p-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{inbox.email}</span>
                    <Badge variant="outline">{inbox.provider}</Badge>
                    {inbox.connected ? (
                      <Badge className="bg-green-500 text-white">
                        Connected
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-500 text-white">
                        Disconnected
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>Domain: {inbox.domain?.domain || "N/A"}</span>
                    <span>Daily Limit: {inbox.daily_limit}</span>
                    <span>
                      Warmup: {inbox.warmup_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    className="w-24"
                    value={inbox.daily_limit}
                    onChange={(e) =>
                      updateInbox(inbox.id, {
                        daily_limit: parseInt(e.target.value) || 100,
                      })
                    }
                  />
                  <Switch
                    checked={inbox.warmup_enabled}
                    onCheckedChange={(checked) =>
                      updateInbox(inbox.id, { warmup_enabled: checked })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}



