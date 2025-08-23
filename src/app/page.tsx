import { redirect } from "next/navigation";
import { getSubscriptionStatus } from "@/lib/subscription";

export default async function Root() {
  const { userId } = await getSubscriptionStatus();
  if (userId) redirect("/dashboard");
  redirect("/(marketing)");
}
