"use client";
import { useEffect, useState } from "react";

type Role = "owner" | "admin" | "member";
type Props = { 
  need: "invite" | "billing" | "write" | "read"; 
  children: React.ReactNode; 
  fallback?: React.ReactNode 
};

export default function Rbac({ need, children, fallback = null }: Props) {
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me/role", { cache: "no-store" });
        const data = await res.json();
        setRole(data.role ?? null);
      } catch (error) {
        console.error("Failed to fetch role:", error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null; // or a shimmer component
  
  if (!role) return fallback;

  const allowed =
    (need === "billing" && role === "owner") ||
    (need === "invite" && (role === "owner" || role === "admin")) ||
    (need === "write" && (role === "owner" || role === "admin" || role === "member")) ||
    (need === "read");

  return <>{allowed ? children : fallback}</>;
}