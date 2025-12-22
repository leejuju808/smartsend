"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
// import { Switch } from "@/components/ui/switch"; // TODO: implement Switch component
import { Button } from "@/components/ui/Button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/Alert";
import { ShieldAlert } from "lucide-react";

/**
 * Settings toggles for send safety.
 * NOTE: Saving is stubbed. Wire to your /api/profile PATCH in your project.
 */

export default function SafetySettingsPage() {
  const [autoSuppressNeg, setAutoSuppressNeg] = useState(true);
  const [autoSuppressRoles, setAutoSuppressRoles] = useState(true);
  const [saved, setSaved] = useState<null | "ok" | "err">(null);

  useEffect(() => {
    // TODO: fetch real values:
    // setAutoSuppressNeg(fetched.auto_suppress_negatives)
    // setAutoSuppressRoles(fetched.auto_suppress_role_accounts)
  }, []);

  async function save() {
    setSaved(null);
    try {
      // TODO: persist to your profile update API
      // await fetch("/api/profile", { method:"PATCH", body: JSON.stringify({ auto_suppress_negatives: autoSuppressNeg, auto_suppress_role_accounts: autoSuppressRoles }) })
      setSaved("ok");
    } catch {
      setSaved("err");
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Send Safety</h1>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Auto-suppress negative intents</AlertTitle>
        <AlertDescription>
          Add <strong>unsubscribe</strong>, <strong>complaint</strong>, and <strong>hard bounces</strong> to your global suppression list automatically.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Auto-suppress negatives</div>
              <div className="text-sm text-muted-foreground">Recommended (on)</div>
            </div>
            <input 
              type="checkbox" 
              checked={autoSuppressNeg} 
              onChange={(e) => setAutoSuppressNeg(e.target.checked)}
              className="w-4 h-4"
            />
          </div>
        </CardContent>
      </Card>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Auto-suppress role accounts on import</AlertTitle>
        <AlertDescription>
          Detect emails like <strong>info@</strong>, <strong>support@</strong>, <strong>sales@</strong> and suppress them during import to protect deliverability and MB/100.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Auto-suppress role accounts</div>
              <div className="text-sm text-muted-foreground">Recommended (on)</div>
            </div>
            <input 
              type="checkbox" 
              checked={autoSuppressRoles} 
              onChange={(e) => setAutoSuppressRoles(e.target.checked)}
              className="w-4 h-4"
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={save}>Save</Button>
            {saved === "ok" && <div className="text-sm text-green-600">Saved</div>}
            {saved === "err" && <div className="text-sm text-red-600">Save failed</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}