import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { AppointmentsList } from "./AppointmentsList";
import { Calendar } from "lucide-react";

export default async function AppointmentsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch upcoming appointments
  const today = new Date().toISOString().split("T")[0];
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["scheduled", "rescheduled"])
    .gte("date", today)
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (error) {
    console.error("Error fetching appointments:", error);
  }

  const upcomingAppointments = appointments || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground mt-1">
            Your scheduled estimates and appointments. SmartSend books these
            automatically when homeowners reply.
          </p>
        </div>
      </div>

      {upcomingAppointments.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center bg-muted/40">
          <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No upcoming appointments</h3>
          <p className="text-sm text-muted-foreground mb-4">
            When homeowners reply wanting an estimate, SmartSend will
            automatically book appointments here.
          </p>
        </div>
      ) : (
        <AppointmentsList appointments={upcomingAppointments} />
      )}
    </div>
  );
}


























