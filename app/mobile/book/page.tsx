"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Calendar, Clock, MapPin, User, Users, Send } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";

/**
 * Screen 4 — Appointment Booking
 * Simple interface to book estimates
 */
type Crew = {
  id: string;
  name: string;
};

export default function MobileBookPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contactId = searchParams.get("contact_id");

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [homeownerName, setHomeownerName] = useState("");
  const [address, setAddress] = useState("");
  const [crewId, setCrewId] = useState("");
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState<any>(null);

  useEffect(() => {
    loadCrews();
    if (contactId) {
      loadContact();
    }
  }, [contactId]);

  async function loadContact() {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .single();

      if (data) {
        setContact(data);
        setHomeownerName(
          `${data.first_name || ""} ${data.last_name || ""}`.trim() || data.email
        );
        setAddress(data.address || "");
      }
    } catch (error) {
      console.error("Error loading contact:", error);
    }
  }

  async function loadCrews() {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      // Load crews/team members
      const { data: members } = await supabase
        .from("workspace_members")
        .select(`
          user_id,
          profiles:user_id (
            id,
            full_name,
            email
          )
        `)
        .eq("workspace_id", workspace.workspace_id);

      if (members) {
        const crewList = members
          .map((m: any) => ({
            id: m.user_id,
            name: m.profiles?.full_name || m.profiles?.email || "Unknown",
          }))
          .filter((c) => c.name !== "Unknown");
        setCrews(crewList);
      }
    } catch (error) {
      console.error("Error loading crews:", error);
    }
  }

  async function handleBook() {
    if (!date || !time || !homeownerName || !address) {
      alert("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      // Combine date and time
      const startTime = new Date(`${date}T${time}`);
      const endTime = new Date(startTime.getTime() + 30 * 60000); // 30 min default

      // Book appointment
      const res = await fetch("/api/mobile/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspace.workspace_id,
          contact_id: contactId || null,
          appointment_type: "full_roof_estimate",
          start_time: startTime.toISOString(),
          homeowner_name: homeownerName,
          homeowner_email: contact?.email || "",
          homeowner_phone: contact?.phone || "",
          property_address: address,
          assigned_to_user_id: crewId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to book appointment");
        return;
      }

      // Send confirmation SMS if phone available
      if (contact?.phone) {
        await fetch("/api/mobile/book/send-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking_id: data.booking_id,
            phone: contact.phone,
            date,
            time,
            address,
          }),
        });
      }

      alert("Appointment booked! Confirmation sent.");
      router.push("/mobile/dashboard");
    } catch (error) {
      console.error("Error booking:", error);
      alert("Failed to book appointment");
    } finally {
      setLoading(false);
    }
  }

  // Set default date to tomorrow
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(tomorrow.toISOString().split("T")[0]);
    setTime("09:00");
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Book Appointment</h1>
            <p className="text-xs text-gray-600">Schedule an estimate</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="p-4 space-y-4">
        {/* Date */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Date *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className="w-full bg-white border rounded-lg px-4 py-3 text-gray-900"
          />
        </div>

        {/* Time */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time *
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full bg-white border rounded-lg px-4 py-3 text-gray-900"
          />
        </div>

        {/* Homeowner Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <User className="h-4 w-4" />
            Homeowner Name *
          </label>
          <input
            type="text"
            value={homeownerName}
            onChange={(e) => setHomeownerName(e.target.value)}
            placeholder="John Smith"
            className="w-full bg-white border rounded-lg px-4 py-3 text-gray-900"
          />
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Property Address *
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, State"
            className="w-full bg-white border rounded-lg px-4 py-3 text-gray-900"
          />
        </div>

        {/* Assign Crew */}
        {crews.length > 0 && (
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Assign Crew (Optional)
            </label>
            <select
              value={crewId}
              onChange={(e) => setCrewId(e.target.value)}
              className="w-full bg-white border rounded-lg px-4 py-3 text-gray-900"
            >
              <option value="">No assignment</option>
              {crews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Book Button */}
        <button
          onClick={handleBook}
          disabled={loading || !date || !time || !homeownerName || !address}
          className="w-full bg-green-500 text-white py-4 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:bg-gray-300 mt-6"
        >
          {loading ? (
            "Booking..."
          ) : (
            <>
              <Send className="h-5 w-5" />
              Book Appointment & Send Confirmation
            </>
          )}
        </button>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          💡 SmartSend will log this as "Booked" and send a confirmation SMS to the homeowner.
        </div>
      </div>
    </div>
  );
}






































