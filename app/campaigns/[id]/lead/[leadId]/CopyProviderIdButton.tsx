"use client";

export default function CopyProviderIdButton({ providerId }: { providerId: string }) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(providerId)}
      className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
      title="Copy provider id"
    >
      Copy provider id
    </button>
  );
}

