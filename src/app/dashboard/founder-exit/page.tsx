import { redirect } from "next/navigation";
import { getUserWithSubscription } from "@/lib/getUserWithSubscription";
import FounderExitClient from "./ui/FounderExitClient";

export const metadata = {
  title: "Founder Exit · SmartSend",
};

export default async function FounderExitPage() {
  const { user } = await getUserWithSubscription();
  if (!user) redirect("/login");
  return <FounderExitClient />;
}



