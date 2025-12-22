import { redirect } from "next/navigation";

export default function TodayPage() {
  // BLOCK 269200 — One-path daily flow: keep this route as an alias.
  redirect("/dashboard/daily");
}










