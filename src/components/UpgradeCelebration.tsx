"use client";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";

export default function UpgradeCelebration() {
  const sp = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (sp.get("upgrade") === "success") {
      fired.current = true;

      // burst 1
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      // burst 2 (stagger)
      setTimeout(() => confetti({ particleCount: 90, spread: 60, angle: 60, origin: { x: 0 } }), 200);
      setTimeout(() => confetti({ particleCount: 90, spread: 60, angle: 120, origin: { x: 1 } }, 200);

      // optional: small toast
      try {
        const el = document.createElement("div");
        el.className =
          "fixed left-1/2 -translate-x-1/2 top-4 z-[9999] rounded-lg bg-black text-white px-4 py-2 text-sm shadow";
        el.textContent = "You're Pro! Welcome 🎉";
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2800);
      } catch {}
    }
  }, [sp]);

  return null;
} 