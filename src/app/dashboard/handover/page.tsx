import { redirect } from "next/navigation";
import { getUserWithSubscription } from "@/lib/getUserWithSubscription";
import HandoverClient from "./HandoverClient";

export default async function HandoverPage() {
  const { user } = await getUserWithSubscription();
  if (!user) redirect("/login");

  return <HandoverClient />;
}




