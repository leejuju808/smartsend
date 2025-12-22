"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Star, StarOff, LayoutTemplate, Search } from "lucide-react";

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
  visibility: "team" | "private";
  is_favorite: boolean;
  owner_user_id: string | null;
};

type Props = {
  onInsert: (tpl: Template) => void;
  currentUserId?: string | null;
};

export function TemplateLibraryDrawer({ onInsert, currentUserId }: Props) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const loadTemplates = async (opts?: { q?: string; favorites?: boolean }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (opts?.q && opts.q.trim().length > 0) {
        params.set("q", opts.q.trim());
      }
      if (opts?.favorites) {
        params.set("favorites", "true");
      }

      const res = await fetch(`/api/templates?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        console.error("load templates error", json);
        setTemplates([]);
        return;
      }

      setTemplates(json.templates || []);
    } catch (err) {
      console.error("load templates exception", err);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadTemplates({ q: search, favorites: showFavoritesOnly });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search, showFavoritesOnly]);

  const toggleFavorite = async (tpl: Template) => {
    // Only owner can toggle favorite/change template; for v1 we'll allow owner-only,
    // but you can relax this later.
    if (tpl.owner_user_id && currentUserId && tpl.owner_user_id !== currentUserId) {
      return;
    }

    try {
      const res = await fetch(`/api/templates/${tpl.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: !tpl.is_favorite }),
      });

      const json = await res.json();

      if (!res.ok) {
        console.error("favorite update error", json);
        return;
      }

      setTemplates((prev) =>
        prev.map((t) => (t.id === tpl.id ? { ...t, ...json.template } : t))
      );
    } catch (err) {
      console.error("favorite update exception", err);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10px]"
        >
          <LayoutTemplate className="h-3 w-3 mr-1" />
          Templates
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[340px] sm:w-[380px] bg-slate-950 border-slate-800">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <LayoutTemplate className="h-4 w-4" />
            Template library
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            Insert saved email templates or pick from your team&apos;s shared
            library.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex flex-col gap-2 text-[11px]">
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-500" />
              <Input
                className="h-7 pl-7 pr-2 text-[11px]"
                placeholder="Search name, subject, body…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSearch(searchInput);
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px]"
              onClick={() => setSearch(searchInput)}
            >
              Go
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowFavoritesOnly((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] ${
                showFavoritesOnly
                  ? "bg-slate-800 text-slate-50"
                  : "text-slate-300 hover:bg-slate-900/80"
              }`}
            >
              {showFavoritesOnly ? (
                <Star className="h-3 w-3 text-amber-300" />
              ) : (
                <StarOff className="h-3 w-3 text-slate-400" />
              )}
              <span>Favorites only</span>
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px]"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setShowFavoritesOnly(false);
              }}
            >
              Clear
            </Button>
          </div>

          <div className="mt-2 border-t border-slate-800 pt-2">
            {loading ? (
              <div className="text-xs text-muted-foreground">
                Loading templates…
              </div>
            ) : templates.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No templates found. Save one from the editor to get started.
              </div>
            ) : (
              <div className="h-[360px] overflow-y-auto pr-2">
                <div className="space-y-2">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className="w-full text-left rounded-md border border-slate-800 bg-slate-950/60 p-2 hover:border-slate-600 hover:bg-slate-900/80 transition-colors"
                      onClick={() => {
                        onInsert(tpl);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-semibold">
                            {tpl.name}
                          </span>
                          {tpl.visibility === "team" ? (
                            <Badge className="bg-slate-900 border-slate-700 text-[9px]">
                              Team
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-900 border-slate-700 text-[9px]">
                              Private
                            </Badge>
                          )}
                        </div>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-amber-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(tpl);
                          }}
                        >
                          {tpl.is_favorite ? (
                            <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                          ) : (
                            <StarOff className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground line-clamp-1">
                        {tpl.subject}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400 whitespace-pre-line line-clamp-2">
                        {tpl.body}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}




