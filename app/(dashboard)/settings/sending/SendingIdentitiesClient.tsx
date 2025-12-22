"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Mail, Plus, Trash2, Star, Settings, AlertTriangle, Shield } from "lucide-react";
import { toast } from "sonner";

type EmailIdentity = {
  id: string;
  org_id: string;
  provider: "gmail" | "outlook";
  email_address: string;
  display_name: string | null;
  identity_name: string | null;
  is_primary: boolean;
  verified: boolean;
  daily_send_limit: number;
  hourly_send_limit?: number;
  disabled?: boolean;
  disable_reason?: string | null;
  last_risk_score?: number | null;
  created_at: string;
  updated_at: string;
};

interface SendingIdentitiesClientProps {
  initialIdentities: EmailIdentity[];
}

export function SendingIdentitiesClient({ initialIdentities }: SendingIdentitiesClientProps) {
  const [identities, setIdentities] = useState<EmailIdentity[]>(initialIdentities);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState<EmailIdentity | null>(null);
  const [formData, setFormData] = useState({
    identity_name: "",
    display_name: "",
    email_address: "",
    provider: "gmail" as "gmail" | "outlook",
    is_primary: false,
    daily_send_limit: 500,
  });

  const loadIdentities = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/sending-identities");
      if (!res.ok) throw new Error("Failed to load identities");
      const data = await res.json();
      setIdentities(data.identities || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load identities");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (identity?: EmailIdentity) => {
    if (identity) {
      setEditingIdentity(identity);
      setFormData({
        identity_name: identity.identity_name || "",
        display_name: identity.display_name || "",
        email_address: identity.email_address,
        provider: identity.provider,
        is_primary: identity.is_primary,
        daily_send_limit: identity.daily_send_limit,
      });
    } else {
      setEditingIdentity(null);
      setFormData({
        identity_name: "",
        display_name: "",
        email_address: "",
        provider: "gmail",
        is_primary: false,
        daily_send_limit: 500,
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingIdentity) {
        // Update existing
        const res = await fetch(`/api/settings/sending-identities/${editingIdentity.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Failed to update identity");
        }

        toast.success("Identity updated successfully");
      } else {
        // Create new
        const res = await fetch("/api/settings/sending-identities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Failed to create identity");
        }

        toast.success("Identity created successfully");
      }

      setDialogOpen(false);
      await loadIdentities();
    } catch (error: any) {
      toast.error(error.message || "Failed to save identity");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this identity? This action cannot be undone.")) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/settings/sending-identities/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete identity");
      }

      toast.success("Identity deleted successfully");
      await loadIdentities();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete identity");
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrimary = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/sending-identities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_primary: true }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to set primary identity");
      }

      toast.success("Primary identity updated");
      await loadIdentities();
    } catch (error: any) {
      toast.error(error.message || "Failed to update primary identity");
    } finally {
      setLoading(false);
    }
  };

  const formatProvider = (provider: string) => {
    return provider === "gmail" ? "Gmail" : provider === "outlook" ? "Outlook" : provider;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sending Identities</h2>
          <p className="text-sm text-muted-foreground">
            Configure multiple email addresses to send campaigns from different identities
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Identity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingIdentity ? "Edit Identity" : "Add Sending Identity"}
                </DialogTitle>
                <DialogDescription>
                  {editingIdentity
                    ? "Update the identity details below."
                    : "Add a new sending identity for your organization."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="identity_name">Identity Name</Label>
                  <Input
                    id="identity_name"
                    placeholder="e.g., Owner, Office, Claims"
                    value={formData.identity_name}
                    onChange={(e) =>
                      setFormData({ ...formData, identity_name: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    A friendly name to identify this identity (e.g., "Owner", "Office")
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="display_name">Display Name</Label>
                  <Input
                    id="display_name"
                    placeholder="e.g., Peak Roofing Office"
                    value={formData.display_name}
                    onChange={(e) =>
                      setFormData({ ...formData, display_name: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    The name recipients will see in their inbox
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email_address">Email Address</Label>
                  <Input
                    id="email_address"
                    type="email"
                    placeholder="owner@company.com"
                    value={formData.email_address}
                    onChange={(e) =>
                      setFormData({ ...formData, email_address: e.target.value })
                    }
                    required
                    disabled={!!editingIdentity}
                  />
                  <p className="text-xs text-muted-foreground">
                    {editingIdentity
                      ? "Email address cannot be changed after creation"
                      : "The email address this identity will send from"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Select
                    value={formData.provider}
                    onValueChange={(value: "gmail" | "outlook") =>
                      setFormData({ ...formData, provider: value })
                    }
                    disabled={!!editingIdentity}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gmail">Gmail</SelectItem>
                      <SelectItem value="outlook">Outlook</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {editingIdentity
                      ? "Provider cannot be changed after creation"
                      : "The email provider for this identity"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="daily_send_limit">Daily Send Limit</Label>
                  <Input
                    id="daily_send_limit"
                    type="number"
                    min="1"
                    value={formData.daily_send_limit}
                    onChange={(e) =>
                      setFormData({ ...formData, daily_send_limit: parseInt(e.target.value) || 500 })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of emails this identity can send per day
                  </p>
                </div>

                {!editingIdentity && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_primary"
                      checked={formData.is_primary}
                      onChange={(e) =>
                        setFormData({ ...formData, is_primary: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="is_primary" className="text-sm font-normal">
                      Set as primary identity
                    </Label>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : editingIdentity ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {identities.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No sending identities</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get started by adding your first sending identity
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Identity
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {identities.map((identity) => (
            <Card key={identity.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {identity.identity_name || "Unnamed Identity"}
                      {identity.is_primary && (
                        <Badge variant="default" className="bg-yellow-500">
                          <Star className="mr-1 h-3 w-3" />
                          Primary
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {identity.email_address}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Provider</span>
                  <Badge variant="outline">{formatProvider(identity.provider)}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={identity.verified ? "default" : "secondary"}>
                    {identity.verified ? (
                      <>
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Connected
                      </>
                    ) : (
                      "Not Connected"
                    )}
                  </Badge>
                </div>
                {/* Block 12100: Health Status */}
                {identity.disabled ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Health</span>
                    <Badge variant="destructive">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Unhealthy
                    </Badge>
                  </div>
                ) : identity.last_risk_score !== null && identity.last_risk_score !== undefined ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Warmup Score</span>
                    <Badge 
                      variant={identity.last_risk_score >= 40 ? "default" : "destructive"}
                      className={identity.last_risk_score < 40 ? "bg-red-500" : ""}
                    >
                      <Shield className="mr-1 h-3 w-3" />
                      {identity.last_risk_score}/100
                    </Badge>
                  </div>
                ) : null}
                {identity.disable_reason && (
                  <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                    {identity.disable_reason}
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Daily Limit</span>
                  <span className="font-medium">{identity.daily_send_limit}</span>
                </div>
                {identity.hourly_send_limit && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Hourly Limit</span>
                    <span className="font-medium">{identity.hourly_send_limit}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                  {!identity.is_primary && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetPrimary(identity.id)}
                      disabled={loading}
                    >
                      <Star className="mr-2 h-4 w-4" />
                      Make Primary
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenDialog(identity)}
                    disabled={loading}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(identity.id)}
                    disabled={loading}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

