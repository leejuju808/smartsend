"use client";
import { useEffect, useState } from "react";

interface TeamSwitcherProps {
  onChange?: (id: string) => void;
}

export default function TeamSwitcher({ onChange }: TeamSwitcherProps) {
  const [teams, setTeams] = useState<any[]>([]);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/teams/list");
        const j = await r.json();
        setTeams(j.items ?? []);
        const saved = localStorage.getItem("activeTeamId") || j.items?.[0]?.id;
        if (saved) {
          setActive(saved);
          onChange?.(saved);
        }
      } catch (error) {
        console.error("Error loading teams:", error);
      }
    })();
  }, [onChange]);

  const handleChange = (teamId: string) => {
    setActive(teamId);
    localStorage.setItem("activeTeamId", teamId);
    onChange?.(teamId);
  };

  return (
    <select
      value={active}
      onChange={(e) => handleChange(e.target.value)}
      className="bg-transparent border border-zinc-700 rounded-xl px-2 py-1"
    >
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

