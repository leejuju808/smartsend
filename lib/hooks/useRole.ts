import { useEffect, useState } from "react";

export function useRole() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/me/role");
      const json = await res.json();
      setRole(json.role ?? null);
    };
    load();
  }, []);

  return role;
}












