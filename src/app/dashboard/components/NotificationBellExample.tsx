// Example integration of NotificationBell into dashboard
// Add this to your dashboard page component

import NotificationBell from "./components/NotificationBell";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <NotificationBell />
      </div>
      {/* Rest of dashboard content */}
    </div>
  );
}