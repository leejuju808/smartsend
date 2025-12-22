"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type ExportFile = { name: string; csv: string };

function downloadTextFile(name: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function OwnerDataExportButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = React.useState(false);

  const onClick = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/export", { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Export failed");

      const files: ExportFile[] = json.files ?? [];
      for (const f of files) {
        downloadTextFile(f.name, f.csv);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Button variant="outline" onClick={onClick} disabled={disabled || loading}>
      {loading ? "Exporting…" : "Export Data (CSV)"}
    </Button>
  );
}










