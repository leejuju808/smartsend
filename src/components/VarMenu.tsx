"use client";

export default function VarMenu({ onPick }: { onPick: (snippet: string) => void }) {
  const vars = [
    "{{first_name | fallback:\"there\"}}",
    "{{company}}",
    "{{title}}",
    "{{lead.email}}",
    "{{custom.industry}}",
  ];
  return (
    <div className="flex gap-2 flex-wrap">
      {vars.map(v => (
        <button key={v} type="button"
          onClick={() => onPick(v)}
          className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded">
          {v}
        </button>
      ))}
    </div>
  );
}