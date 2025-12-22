"use client";

export default function BookedPage() {
  const params =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const status = params.get("status");
  const start = params.get("start");

  const title =
    status === "ok"
      ? "You're booked!"
      : status === "already"
        ? "Already booked"
        : status === "expired"
          ? "Link expired"
          : "Booking";

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {start ? (
          <p className="text-muted-foreground">
            Start time: {new Date(start).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          You'll receive a calendar invite and email confirmation shortly.
        </p>
      </div>
    </main>
  );
}


