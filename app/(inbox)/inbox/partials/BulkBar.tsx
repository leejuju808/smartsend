"use client";

import * as React from "react";

async function postJSON(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}

export function BulkBar() {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [labelName, setLabelName] = React.useState("");

  React.useEffect(() => {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[data-thread-select]'),
    );
    const onChange = () =>
      setSelected(inputs.filter((i) => i.checked).map((i) => i.value));
    inputs.forEach((i) => i.addEventListener("change", onChange));
    return () => inputs.forEach((i) => i.removeEventListener("change", onChange));
  }, []);

  const unpause = async () => {
    if (selected.length === 0) return;
    await postJSON("/api/threads/bulk/unpause", { threadIds: selected });
    location.reload();
  };

  const addLabel = async () => {
    if (!labelName.trim() || selected.length === 0) return;
    await postJSON("/api/threads/bulk/label", {
      threadIds: selected,
      labelName: labelName.trim(),
    });
    setLabelName("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
      <span className="text-sm text-muted-foreground">
        {selected.length} selected
      </span>
      <button
        className="px-3 py-1 rounded-md text-sm bg-emerald-600 text-white disabled:opacity-50"
        onClick={unpause}
        disabled={selected.length === 0}
      >
        Unpause
      </button>

      <div className="flex items-center gap-2">
        <input
          placeholder="Add label…"
          value={labelName}
          onChange={(e) => setLabelName(e.target.value)}
          className="h-8 w-40 rounded-md border px-2 text-sm"
        />
        <button
          className="px-3 py-1 rounded-md text-sm bg-zinc-900 text-white disabled:opacity-50"
          onClick={addLabel}
          disabled={selected.length === 0 || !labelName.trim()}
        >
          Apply
        </button>
      </div>

      <button
        className="ml-auto px-3 py-1 rounded-md text-sm border"
        onClick={() => {
          document
            .querySelectorAll<HTMLInputElement>('input[data-thread-select]')
            .forEach((i) => (i.checked = false));
          setSelected([]);
        }}
      >
        Clear
      </button>
    </div>
  );
}





