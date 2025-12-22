"use client";
import { useState, useEffect, useCallback } from "react";
import { rewriteText } from "@/lib/replies/rewriter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/Button";
import { Loader2 } from "lucide-react";

// Basic HTML sanitization - preserve links and basic formatting, remove script tags
function sanitizeHTML(html: string): string {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  
  // Remove script and style tags
  const scripts = tempDiv.querySelectorAll("script, style, iframe, object, embed");
  scripts.forEach(el => el.remove());
  
  // Remove event handlers (onclick, etc.)
  const allElements = tempDiv.querySelectorAll("*");
  allElements.forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    });
  });
  
  return tempDiv.innerHTML;
}

interface ComposerRewriteProps {
  /** Selector for the contenteditable element or textarea */
  editorSelector?: string;
  /** Callback when rewrite is complete with new HTML */
  onRewrite?: (rewrittenHtml: string) => void;
  /** Optional: initial tone */
  defaultTone?: string;
  /** Optional: className for the container */
  className?: string;
}

export default function ComposerRewrite({
  editorSelector = "[contenteditable]",
  onRewrite,
  defaultTone = "professional",
  className = "",
}: ComposerRewriteProps) {
  const [tone, setTone] = useState(defaultTone);
  const [rewriting, setRewriting] = useState(false);

  // Persist tone to localStorage
  useEffect(() => {
    const savedTone = localStorage.getItem("rewrite-tone");
    if (savedTone) {
      setTone(savedTone);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("rewrite-tone", tone);
  }, [tone]);

  const doRewrite = useCallback(async () => {
    setRewriting(true);
    try {
      // Try to find contenteditable element first
      let editorElement = document.querySelector(editorSelector) as HTMLElement;
      
      // Fallback: try textarea if contenteditable not found
      if (!editorElement) {
        editorElement = document.querySelector("textarea") as HTMLElement;
      }

      if (!editorElement) {
        throw new Error("No editor element found");
      }

      // Get content based on element type
      let plain = "";
      if (editorElement.isContentEditable || editorElement.contentEditable === "true") {
        plain = editorElement.innerHTML || editorElement.innerText || "";
      } else if (editorElement.tagName === "TEXTAREA") {
        plain = (editorElement as HTMLTextAreaElement).value || "";
      } else {
        plain = editorElement.innerText || editorElement.textContent || "";
      }

      if (!plain.trim()) {
        alert("Please enter some text to rewrite");
        return;
      }

      const newHtml = await rewriteText(plain, tone);

      // Replace content based on element type
      if (editorElement.isContentEditable || editorElement.contentEditable === "true") {
        // Sanitize HTML before inserting (preserve links and basic formatting)
        const sanitized = sanitizeHTML(newHtml);
        editorElement.innerHTML = sanitized;
      } else if (editorElement.tagName === "TEXTAREA") {
        (editorElement as HTMLTextAreaElement).value = newHtml;
      } else {
        editorElement.innerText = newHtml;
      }

      // Trigger input/change events
      const event = new Event("input", { bubbles: true });
      editorElement.dispatchEvent(event);

      // Callback
      onRewrite?.(newHtml);

      // Optional: Add a subtle animation class
      editorElement.classList.add("animate-pulse");
      setTimeout(() => {
        editorElement.classList.remove("animate-pulse");
      }, 500);
    } catch (error: any) {
      console.error("Rewrite failed:", error);
      alert(error.message || "Failed to rewrite. Please try again.");
    } finally {
      setRewriting(false);
    }
  }, [editorSelector, tone, onRewrite]);

  // Keyboard shortcut handler (Cmd/Ctrl + Shift + R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + R
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "R" && !rewriting) {
        const target = e.target as HTMLElement;
        const editorElement = document.querySelector(editorSelector) as HTMLElement;
        
        // Check if target is within or is the editor
        const isInEditor = editorElement && (
          editorElement.contains(target) ||
          editorElement === target ||
          (target.tagName === "TEXTAREA" && document.querySelector(editorSelector) === editorElement) ||
          (target.isContentEditable && editorElement.contains(target))
        );

        if (isInEditor) {
          e.preventDefault();
          e.stopPropagation();
          doRewrite();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [doRewrite, editorSelector, rewriting]);

  return (
    <div className={`flex items-center justify-between mt-2 ${className}`}>
      <div className="flex gap-2 items-center">
        <Select value={tone} onValueChange={setTone}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="friendly">Friendly</SelectItem>
            <SelectItem value="casual">Casual</SelectItem>
            <SelectItem value="persuasive">Persuasive</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={doRewrite}
          disabled={rewriting}
          size="sm"
        >
          {rewriting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Rewriting…
            </>
          ) : (
            "Rewrite (⌘⇧R)"
          )}
        </Button>
      </div>
    </div>
  );
}

