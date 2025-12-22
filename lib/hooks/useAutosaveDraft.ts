"use client";

import { useEffect, useRef, useState } from "react";

export function useAutosaveDraft(opts: {
  draftType: string;
  entityId?: string | null;
  initialContent?: any;
  delay?: number;    // ms
}) {
  const { draftType, entityId, initialContent, delay = 1200 } = opts;

  const [content, setContent] = useState<any>(initialContent);
  const [status, setStatus] = useState<"saved" | "saving" | "dirty">("saved");

  const timer = useRef<NodeJS.Timeout | null>(null);

  // Update content when initialContent changes (e.g., when draft loads)
  useEffect(() => {
    if (initialContent !== undefined) {
      setContent(initialContent);
      setStatus("saved");
    }
  }, [initialContent]);

  // Save draft function
  const saveDraft = async (payload: any) => {
    setStatus("saving");

    try {
      const res = await fetch("/api/drafts/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draftType,
          entityId: entityId || null,
          content: payload,
        }),
      });

      if (res.ok) {
        setStatus("saved");
      } else {
        setStatus("dirty");
      }
    } catch (error) {
      console.error("Error saving draft:", error);
      setStatus("dirty");
    }
  };

  // Trigger auto-save
  const updateContent = (next: any) => {
    setContent(next);
    setStatus("dirty");

    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      saveDraft(next);
    }, delay);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  return {
    content,
    setContent: updateContent,
    status, // "dirty" | "saving" | "saved"
  };
}

