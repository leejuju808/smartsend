import { redirect } from "next/navigation";
import { requireProOrRedirect } from "@/lib/subscription";
import PipelineClient from "./PipelineClient";

export default async function PipelinePage() {
  const gate = await requireProOrRedirect();
  if (!gate.ok) redirect(gate.redirect);

  return <PipelineClient />;
}

