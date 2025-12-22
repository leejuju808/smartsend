"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type JobPhoto = {
  id: string;
  job_id: string;
  category: "before" | "after" | string;
  photo_url: string;
  uploaded_at?: string | null;
};

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
    });
    return img;
  } finally {
    // revoke in caller after draw (we need it loaded first)
    // (safe: revoke here after load; browser keeps decoded pixels)
    URL.revokeObjectURL(url);
  }
}

async function stampImage(file: File, stampText: string): Promise<File> {
  const img = await fileToImage(file);

  // Downscale very large photos (faster upload, still print-friendly)
  const maxW = 1600;
  const scale = img.width > maxW ? maxW / img.width : 1;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(img, 0, 0, w, h);

  // Watermark block
  const pad = Math.max(10, Math.round(w * 0.015));
  const fontSize = Math.max(16, Math.round(w * 0.03));
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
  ctx.textBaseline = "bottom";

  const text = stampText;
  const metrics = ctx.measureText(text);
  const boxW = Math.min(w - pad * 2, Math.ceil(metrics.width) + pad * 2);
  const boxH = fontSize + pad * 2;

  const x = pad;
  const y = h - pad;

  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(x, y - boxH, boxW, boxH);

  ctx.fillStyle = "rgba(255,255,255,0.98)";
  ctx.fillText(text, x + pad, y - pad);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error("Failed to encode image"));
        else resolve(b);
      },
      "image/jpeg",
      0.9
    );
  });

  const name = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${name}-stamped.jpg`, { type: "image/jpeg" });
}

export function HardEvidenceUploader({ jobId }: { jobId: string }) {
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "before" | "after">(null);
  const [error, setError] = useState<string | null>(null);

  const ready = useMemo(() => Boolean(beforeUrl && afterUrl), [beforeUrl, afterUrl]);

  const loadExisting = async () => {
    try {
      setError(null);
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/photos`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      const photos: JobPhoto[] = (json as any)?.photos || [];
      const before = photos.find((p) => p.category === "before")?.photo_url || null;
      const after = photos.find((p) => p.category === "after")?.photo_url || null;
      setBeforeUrl(before);
      setAfterUrl(after);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const upload = async (category: "before" | "after", file: File) => {
    setBusy(category);
    setError(null);

    try {
      const stamped = await stampImage(file, "Job originated via SmartSend");

      const form = new FormData();
      form.append("file", stamped);
      form.append("category", category);

      const up = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/hard-evidence/upload`, {
        method: "POST",
        body: form,
      });

      const upJson = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(upJson?.error || "Upload failed");

      const url = String(upJson?.photo_url || "");
      if (!url) throw new Error("Upload succeeded but no URL returned");

      // Store photo metadata on job_progress_photos
      const meta = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo_url: url,
          category,
          description: "Job originated via SmartSend",
        }),
      });

      const metaJson = await meta.json().catch(() => ({}));
      if (!meta.ok) throw new Error(metaJson?.error || "Failed to save photo metadata");

      if (category === "before") setBeforeUrl(url);
      if (category === "after") setAfterUrl(url);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-gray-900">Hard Evidence (Before/After)</div>
          <div className="mt-1 text-xs text-gray-500">
            Upload 1 before + 1 after photo. SmartSend auto-stamps: “Job originated via SmartSend”.
          </div>
        </div>
        {ready ? (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">Proof ready</span>
        ) : (
          <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">Missing photos</span>
        )}
      </div>

      {error ? <div className="mt-3 text-xs font-semibold text-red-600">{error}</div> : null}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <div className="text-xs font-semibold text-gray-700">Before</div>
          {beforeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={beforeUrl} alt="Before" className="mt-2 h-44 w-full object-cover rounded-lg" />
          ) : (
            <div className="mt-2 h-44 rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-500">No photo</div>
          )}
          <div className="mt-2">
            <input
              type="file"
              accept="image/*"
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload("before", f).catch((err) => setError(err?.message || "Upload failed"));
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>

        <div className="rounded-xl border p-3">
          <div className="text-xs font-semibold text-gray-700">After</div>
          {afterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={afterUrl} alt="After" className="mt-2 h-44 w-full object-cover rounded-lg" />
          ) : (
            <div className="mt-2 h-44 rounded-lg bg-gray-50 flex items-center justify-center text-xs text-gray-500">No photo</div>
          )}
          <div className="mt-2">
            <input
              type="file"
              accept="image/*"
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload("after", f).catch((err) => setError(err?.message || "Upload failed"));
                e.currentTarget.value = "";
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => loadExisting()}>
          Refresh
        </Button>
        {busy ? <div className="text-xs text-gray-500">Uploading {busy}…</div> : null}
      </div>
    </div>
  );
}



