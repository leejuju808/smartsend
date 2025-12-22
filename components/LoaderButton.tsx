"use client";
import { useState } from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { loadingText?: string };

export default function LoaderButton({ loadingText = "Working...", children, ...rest }: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      {...rest}
      onClick={async (e) => {
        if (rest.onClick) {
          setBusy(true);
          try { await Promise.resolve(rest.onClick(e)); }
          finally { setBusy(false); }
        }
      }}
      disabled={busy || rest.disabled}
      className={`px-4 py-2 rounded-lg font-semibold transition ${rest.className ?? ""} ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      {busy ? loadingText : children}
    </button>
  );
}