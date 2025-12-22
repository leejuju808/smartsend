"use client";

// Block 42000 — SmartSend Roofing Crew App v1
// Owner Dashboard: Live Crew Operations View
// app/dashboard/crew-operations/page.tsx

import { useEffect, useState } from "react";
import { 
  Activity, 
  Camera, 
  Package, 
  CheckSquare, 
  AlertCircle,
  Clock,
  MapPin,
  User
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface JobActivity {
  id: string;
  type: string;
  member_name: string;
  payload: any;
  created_at: string;
}

interface PunchListItem {
  id: string;
  description: string;
  status: string;
  created_at: string;
}

interface ChangeOrder {
  id: string;
  description: string;
  suggested_price: number | null;
  status: string;
  created_at: string;
  job_id: string;
}

export default function CrewOperationsPage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activities, setActivities] = useState<JobActivity[]>([]);
  const [punchList, setPunchList] = useState<PunchListItem[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [selectedJobId]);

  const loadData = async () => {
    const supabase = createClient();
    
    // Load active jobs
    const { data: jobsData } = await supabase
      .from("roofing_jobs")
      .select("id, title, address, status, scheduled_date")
      .in("status", ["scheduled", "in_progress"])
      .order("scheduled_date", { ascending: true })
      .limit(10);

    if (jobsData) {
      setJobs(jobsData);
      if (!selectedJobId && jobsData.length > 0) {
        setSelectedJobId(jobsData[0].id);
      }
    }

    if (selectedJobId) {
      // Load activities
      const { data: activitiesData } = await supabase
        .from("job_activity_log")
        .select(`
          *,
          crew_members (
            name,
            role
          )
        `)
        .eq("job_id", selectedJobId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (activitiesData) {
        setActivities(activitiesData.map((a: any) => ({
          ...a,
          member_name: a.crew_members?.name || "Unknown",
        })));
      }

      // Load punch list
      const { data: punchData } = await supabase
        .from("punch_list")
        .select("*")
        .eq("job_id", selectedJobId)
        .order("created_at", { ascending: false });

      if (punchData) {
        setPunchList(punchData);
      }

      // Load change orders
      const { data: changeOrdersData } = await supabase
        .from("change_orders")
        .select("*")
        .eq("job_id", selectedJobId)
        .order("created_at", { ascending: false });

      if (changeOrdersData) {
        setChangeOrders(changeOrdersData);
      }
    }

    setLoading(false);
  };

  const handleApproveChangeOrder = async (changeOrderId: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return;

    const { error } = await supabase
      .from("change_orders")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: user.id,
      })
      .eq("id", changeOrderId);

    if (!error) {
      loadData();
      alert("Change order approved!");
    }
  };

  const handleRejectChangeOrder = async (changeOrderId: string) => {
    const supabase = createClient();
    
    const { error } = await supabase
      .from("change_orders")
      .update({ status: "rejected" })
      .eq("id", changeOrderId);

    if (!error) {
      loadData();
      alert("Change order rejected.");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading crew operations...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Crew Operations</h1>
          <p className="text-gray-500 mt-1">Live crew progress and field operations</p>
        </div>
      </div>

      {/* Job Selector */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Job
        </label>
        <select
          value={selectedJobId || ""}
          onChange={(e) => setSelectedJobId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select a job...</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title || "Untitled"} - {job.address || "No address"}
            </option>
          ))}
        </select>
      </div>

      {selectedJobId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Activity Feed */}
          <div className="lg:col-span-2 space-y-6">
            {/* Activity Feed */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold">Activity Feed</h2>
              </div>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {activities.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No activity yet</p>
                ) : (
                  activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="mt-1">
                        {activity.type === "start" && (
                          <Clock className="w-5 h-5 text-green-600" />
                        )}
                        {activity.type === "stop" && (
                          <Clock className="w-5 h-5 text-red-600" />
                        )}
                        {activity.type === "photo" && (
                          <Camera className="w-5 h-5 text-blue-600" />
                        )}
                        {activity.type === "material" && (
                          <Package className="w-5 h-5 text-orange-600" />
                        )}
                        {activity.type === "change_order" && (
                          <AlertCircle className="w-5 h-5 text-yellow-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {activity.member_name} - {activity.type}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(activity.created_at).toLocaleString()}
                        </div>
                        {activity.payload && Object.keys(activity.payload).length > 0 && (
                          <div className="text-xs text-gray-600 mt-1">
                            {JSON.stringify(activity.payload, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Change Orders */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <h2 className="text-xl font-semibold">Change Orders</h2>
              </div>
              <div className="space-y-4">
                {changeOrders.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No change orders</p>
                ) : (
                  changeOrders.map((co) => (
                    <div
                      key={co.id}
                      className="p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 mb-1">
                            {co.description}
                          </div>
                          {co.suggested_price && (
                            <div className="text-sm text-gray-600">
                              Suggested: ${co.suggested_price.toFixed(2)}
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(co.created_at).toLocaleString()}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs rounded ${
                            co.status === "approved"
                              ? "bg-green-100 text-green-800"
                              : co.status === "rejected"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {co.status}
                        </span>
                      </div>
                      {co.status === "pending" && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleApproveChangeOrder(co.id)}
                            className="flex-1 bg-green-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-green-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectChangeOrder(co.id)}
                            className="flex-1 bg-red-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Punch List */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckSquare className="w-5 h-5 text-purple-600" />
                <h2 className="text-xl font-semibold">Punch List</h2>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {punchList.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No punch list items</p>
                ) : (
                  punchList.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border ${
                        item.status === "completed"
                          ? "bg-green-50 border-green-200"
                          : item.status === "needs_attention"
                          ? "bg-red-50 border-red-200"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div
                          className={`flex-1 ${
                            item.status === "completed" ? "line-through text-gray-500" : ""
                          }`}
                        >
                          {item.description}
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            item.status === "completed"
                              ? "bg-green-100 text-green-800"
                              : item.status === "needs_attention"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {item.status.replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(item.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}































