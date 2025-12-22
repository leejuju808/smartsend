// Block 33602 — Public Booking Widget Page
// Homeowner-facing page to select appointment times
// URL: /book?t=TOKEN&c=CONTRACTOR_ID&l=LEAD_ID

"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Calendar, Clock, CheckCircle2, Loader2 } from "lucide-react";

interface BookingLinkData {
  token: string;
  contractor: {
    id: string;
    name: string;
  } | null;
  lead: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    address: string | null;
  } | null;
  schedule_settings: any;
  appointment_types: Array<{
    id: string;
    name: string;
    duration_minutes: number;
  }>;
  expires_at: string | null;
}

interface TimeSlot {
  start_time: string;
  end_time: string;
}

export default function BookingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams?.get("t") || null;
  const contractorId = searchParams?.get("c") || null;
  const leadId = searchParams?.get("l") || null;

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<BookingLinkData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load booking link data
  useEffect(() => {
    if (!token) {
      setError("Missing booking token");
      setLoading(false);
      return;
    }

    async function loadBookingLink() {
      try {
        const res = await fetch(`/api/public/booking/${token}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Invalid booking link");
          setLoading(false);
          return;
        }

        const data = await res.json();
        setBooking(data);
        if (data.appointment_types && data.appointment_types.length > 0) {
          setSelectedType(data.appointment_types[0].name);
        }
        setLoading(false);
      } catch (err: any) {
        setError(err.message || "Failed to load booking link");
        setLoading(false);
      }
    }

    loadBookingLink();
  }, [token]);

  // Load available slots when date or appointment type changes
  useEffect(() => {
    if (!token || !selectedDate || !selectedType || !booking) return;

    async function loadSlots() {
      setLoadingSlots(true);
      try {
        const appointmentType = booking.appointment_types.find(
          (t) => t.name === selectedType
        );
        const duration = appointmentType?.duration_minutes || 45;

        const res = await fetch(
          `/api/public/booking/${token}/slots?date=${selectedDate}&duration=${duration}`
        );
        if (!res.ok) {
          setSlots([]);
          setLoadingSlots(false);
          return;
        }

        const data = await res.json();
        setSlots(data.slots || []);
        setLoadingSlots(false);
      } catch (err) {
        setSlots([]);
        setLoadingSlots(false);
      }
    }

    loadSlots();
  }, [token, selectedDate, selectedType, booking]);

  const handleBook = async () => {
    if (!selectedSlot || !selectedType || !booking || !token) return;

    setBookingInProgress(true);
    setError(null);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error("Missing Supabase URL configuration");
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/book-appointment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contractor_id: booking.contractor?.id,
          lead_id: booking.lead?.id,
          start_time: selectedSlot.start_time,
          end_time: selectedSlot.end_time,
          appointment_type: selectedType,
          location: booking.lead?.address || null,
          token: token,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to book appointment");
      }

      setBookingComplete(true);
    } catch (err: any) {
      setError(err.message || "Failed to book appointment");
      setBookingInProgress(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="text-red-600 text-xl font-semibold mb-2">
            Invalid Booking Link
          </div>
          <p className="text-gray-600">
            Missing booking token. Please use the booking link shared in your email.
          </p>
        </div>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="text-red-600 text-xl font-semibold mb-2">
            {error}
          </div>
          <p className="text-gray-600">
            Please contact the contractor for a new booking link.
          </p>
        </div>
      </div>
    );
  }

  if (bookingComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Appointment Booked!
          </h1>
          <p className="text-gray-600 mb-4">
            Your appointment has been confirmed. You'll receive a confirmation
            email shortly.
          </p>
          {selectedSlot && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="text-sm text-gray-600 mb-1">Scheduled for:</div>
              <div className="text-lg font-semibold text-gray-900">
                {new Date(selectedSlot.start_time).toLocaleString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!booking) return null;

  // Get dates for next 14 days
  const availableDates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    availableDates.push(date.toISOString().split("T")[0]);
  }

  const formatTime = (timeStr: string) => {
    return new Date(timeStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Book Your Appointment
          </h1>
          {booking.contractor && (
            <p className="text-gray-600">
              with <span className="font-semibold">{booking.contractor.name}</span>
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Appointment Type & Date Selection */}
          <div className="space-y-6">
            {/* Appointment Type */}
            {booking.appointment_types.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Appointment Type
                </h2>
                <div className="space-y-2">
                  {booking.appointment_types.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => {
                        setSelectedType(type.name);
                        setSelectedSlot(null);
                      }}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                        selectedType === type.name
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="font-semibold text-gray-900">
                        {type.name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {type.duration_minutes} minutes
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Date Selection */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Select Date
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableDates.map((dateStr) => {
                  const date = new Date(dateStr);
                  const isToday = dateStr === new Date().toISOString().split("T")[0];
                  const isSelected = dateStr === selectedDate;

                  return (
                    <button
                      key={dateStr}
                      onClick={() => {
                        setSelectedDate(dateStr);
                        setSelectedSlot(null);
                      }}
                      className={`p-3 rounded-lg border-2 transition-colors text-center ${
                        isSelected
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="text-xs text-gray-600">
                        {date.toLocaleDateString("en-US", { weekday: "short" })}
                      </div>
                      <div className="font-semibold text-gray-900">
                        {date.getDate()}
                      </div>
                      <div className="text-xs text-gray-600">
                        {date.toLocaleDateString("en-US", { month: "short" })}
                      </div>
                      {isToday && (
                        <div className="text-xs text-blue-600 font-semibold mt-1">
                          Today
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Time Slot Selection */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Available Times
            </h2>

            {loadingSlots ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                No available time slots for this date.
                <br />
                Please select another date.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                {slots.map((slot, idx) => {
                  const isSelected =
                    selectedSlot?.start_time === slot.start_time;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedSlot(slot)}
                      className={`p-3 rounded-lg border-2 transition-colors text-center ${
                        isSelected
                          ? "border-blue-600 bg-blue-50 font-semibold"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {formatTime(slot.start_time)}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedSlot && (
              <div className="mt-6 pt-6 border-t">
                <div className="bg-blue-50 rounded-lg p-4 mb-4">
                  <div className="text-sm text-gray-600 mb-1">Selected:</div>
                  <div className="font-semibold text-gray-900">
                    {new Date(selectedSlot.start_time).toLocaleDateString(
                      "en-US",
                      {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      }
                    )}
                    {" at "}
                    {formatTime(selectedSlot.start_time)}
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleBook}
                  disabled={bookingInProgress}
                  className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {bookingInProgress ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Booking...
                    </>
                  ) : (
                    "Confirm Appointment"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

































