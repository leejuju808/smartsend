// src/hooks/useCsvImport.ts
import { useRef, useState } from "react";
import { uploadCsvToSupabaseFn } from "@/lib/uploadCsv";

function buildErrorCsv(errors: Array<Record<string, any>>): Blob | null {
  if (!errors?.length) return null;
  const cols = Array.from(new Set(errors.flatMap((e) => Object.keys(e))));
  const header = cols.join(",");
  const rows = errors.map((e) => cols.map((c) => JSON.stringify(e[c] ?? "")).join(","));
  const csv = [header, ...rows].join("\n");
  return new Blob([csv], { type: "text/csv;charset=utf-8;" });
}

export function useCsvImport() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; errors: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorCsvUrlRef = useRef<string | null>(null);

  async function importCsv(file: File, campaignId: string, mapping?: Record<string, string>) {
    setIsUploading(true);
    setProgress(10);
    setError(null);
    setResult(null);

    try {
      setProgress(30);
      const data = await uploadCsvToSupabaseFn({ file, campaignId, mapping });
      setProgress(80);

      if (errorCsvUrlRef.current) {
        URL.revokeObjectURL(errorCsvUrlRef.current);
        errorCsvUrlRef.current = null;
      }
      let errorCsvUrl: string | null = null;
      const errors = (data as any)?.errors || (data as any)?.errors_preview || [];
      if (errors?.length) {
        const blob = buildErrorCsv(errors);
        if (blob) errorCsvUrl = URL.createObjectURL(blob);
      }

      setResult({ imported: (data as any).imported ?? 0, errors });
      setProgress(100);

      return { ...(data as any), errorCsvUrl };
    } catch (e: any) {
      setError(e.message || "Upload failed");
      setProgress(100);
      throw e;
    } finally {
      setIsUploading(false);
    }
  }

  return {
    isUploading,
    progress,
    result,
    error,
    importCsv,
  };
}















