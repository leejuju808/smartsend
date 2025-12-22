// app/(dashboard)/page.tsx
// Reality Enforcement: the home route forwards to the only truth screen.
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
