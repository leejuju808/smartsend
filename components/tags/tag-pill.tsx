"use client";

export function TagPill({ name }: { name: string }) {
  return (
    <span className="px-2 py-1 rounded-full text-xs bg-blue-600 text-white">
      {name}
    </span>
  );
}

