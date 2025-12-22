"use client";

import useSWR from "swr";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type Snippet = {
  id: string;
  title: string;
  body: string;
  category: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function SnippetsDropdown({ onInsert }: { onInsert: (snippet: string) => void }) {
  const { data, error } = useSWR<{ snippets: Snippet[] }>("/api/snippets/list", fetcher);

  if (error) {
    console.error("Failed to load snippets:", error);
  }

  const snippets = data?.snippets || [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          Snippets
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 max-h-80 overflow-y-auto">
        <DropdownMenuLabel>Insert Snippet</DropdownMenuLabel>
        {snippets.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No snippets available
          </div>
        ) : (
          snippets.map((sn) => (
            <DropdownMenuItem
              key={sn.id}
              onClick={() => onInsert(sn.body)}
              className="flex flex-col items-start"
            >
              <span className="text-sm font-medium">{sn.title}</span>
              {sn.category && (
                <span className="text-[10px] opacity-60">{sn.category}</span>
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

