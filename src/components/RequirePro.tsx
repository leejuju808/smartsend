import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireProOrRedirect } from "@/lib/subscription";

export default async function RequirePro({ children }: { children: ReactNode }) {
  const gate = await requireProOrRedirect();
  if (!gate.ok) redirect(gate.redirect);

  return <>{children}</>;
}

