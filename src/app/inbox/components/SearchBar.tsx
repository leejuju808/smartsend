"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { colors } from "../constants/colors";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <Search
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
        style={{ color: colors.inkSecondary }}
        strokeWidth={2}
      />
      <Input
        type="text"
        placeholder="Search by name, email, or keyword…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 rounded-lg transition-all focus:ring-2"
        style={{
          borderColor: colors.divider,
          backgroundColor: colors.white,
        }}
      />
    </div>
  );
}

