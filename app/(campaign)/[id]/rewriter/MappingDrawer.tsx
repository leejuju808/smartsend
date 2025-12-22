"use client";
import * as React from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function MappingDrawer({
  presetId,
  open,
  onClose,
  vars,
}: {
  presetId: string;
  open: boolean;
  onClose: () => void;
  vars: string[];
}) {
  const [rows, setRows] = React.useState<Array<{ var_name: string; lead_path: string; fallback: string }>>([]);

  React.useEffect(() => {
    (async () => {
      if (!open) return;
      const r = await fetch(`/api/rewriter/${presetId}/mappings`);
      if (r.ok) {
        setRows(await r.json());
      } else {
        setRows(vars.map((v) => ({ var_name: v, lead_path: "", fallback: "" })));
      }
    })();
  }, [open, presetId, vars]);

  async function save() {
    const r = await fetch(`/api/rewriter/${presetId}/mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings: rows }),
    });
    if (r.ok) {
      toast.success("Mappings saved");
      onClose();
    } else {
      toast.error("Save failed");
    }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Variable Mapping</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-3">
          {rows.map((row, i) => (
            <div key={row.var_name} className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label>Var</Label>
                <Input value={row.var_name} disabled />
              </div>
              <div>
                <Label>Lead path</Label>
                <Input
                  placeholder="first_name | company | meta->>website"
                  value={row.lead_path}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], lead_path: e.target.value };
                    setRows(next);
                  }}
                />
              </div>
              <div>
                <Label>Fallback</Label>
                <Input
                  placeholder="there"
                  value={row.fallback}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...next[i], fallback: e.target.value };
                    setRows(next);
                  }}
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}








