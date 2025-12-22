// Block 70000 — SmartSend Roofing Equipment Tracking + Fleet Maintenance System v1
// Crew App: Equipment Checkout/Return
// app/crew/equipment/page.tsx

"use client";

import { useEffect, useState } from "react";
import { 
  Package, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Wrench
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Equipment {
  id: string;
  name: string;
  type: string;
  condition: string;
  status: string;
}

interface Checkout {
  id: string;
  equipment_id: string;
  equipment: Equipment;
  checked_out_at: string;
  condition_at_checkout: string;
  job_id?: string;
  job?: { title: string } | null;
}

export default function CrewEquipmentPage() {
  const router = useRouter();
  const [availableEquipment, setAvailableEquipment] = useState<Equipment[]>([]);
  const [myCheckouts, setMyCheckouts] = useState<Checkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"available" | "my-checkouts">("available");
  const [returningId, setReturningId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    // Get crew member ID
    const { data: member } = await supabase
      .from("crew_members")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (member) {
      setMemberId(member.id);

      // Load available equipment
      const { data: equipmentData } = await supabase
        .from("equipment")
        .select("*")
        .eq("status", "available")
        .order("name", { ascending: true });

      if (equipmentData) {
        setAvailableEquipment(equipmentData as Equipment[]);
      }

      // Load my checkouts
      const { data: checkoutsData } = await supabase
        .from("equipment_checkouts")
        .select(`
          *,
          equipment:equipment(*),
          job:roofing_jobs(id, title)
        `)
        .eq("crew_member_id", member.id)
        .is("returned_at", null)
        .order("checked_out_at", { ascending: false });

      if (checkoutsData) {
        setMyCheckouts(checkoutsData as Checkout[]);
      }
    }

    setLoading(false);
  }

  const handleCheckout = async (equipmentId: string) => {
    if (!memberId) return;

    try {
      const response = await fetch("/api/equipment/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipment_id: equipmentId,
          crew_member_id: memberId,
          condition: "functional",
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert("Equipment checked out successfully");
        loadData();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error checking out equipment:", error);
      alert("Failed to checkout equipment. Please try again.");
    }
  };

  const handleReturn = async (checkoutId: string, condition: string) => {
    if (!memberId) return;

    setReturningId(checkoutId);

    try {
      const response = await fetch("/api/equipment/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkout_id: checkoutId,
          condition: condition,
          return_notes: "",
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert("Equipment returned successfully");
        loadData();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error returning equipment:", error);
      alert("Failed to return equipment. Please try again.");
    } finally {
      setReturningId(null);
    }
  };

  const handleReportDamage = async (checkoutId: string) => {
    if (!memberId) return;

    const description = prompt("Describe the damage:");
    if (!description) return;

    try {
      const checkout = myCheckouts.find(c => c.id === checkoutId);
      if (!checkout) return;

      const response = await fetch("/api/equipment/report-damage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipment_id: checkout.equipment_id,
          crew_member_id: memberId,
          issue_description: description,
          severity: "moderate",
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert("Damage reported. Repair ticket created.");
        loadData();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error reporting damage:", error);
      alert("Failed to report damage. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="text-center py-8">
          <div className="text-gray-500">Loading equipment...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
          <p className="text-sm text-gray-500 mt-1">
            Check out and return tools
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab("available")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "available"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Available ({availableEquipment.length})
            </button>
            <button
              onClick={() => setActiveTab("my-checkouts")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "my-checkouts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              My Checkouts ({myCheckouts.length})
            </button>
          </nav>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {activeTab === "available" && (
          <>
            {availableEquipment.length === 0 ? (
              <div className="bg-white rounded-lg p-6 text-center shadow-sm">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No equipment available</p>
              </div>
            ) : (
              availableEquipment.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{item.type}</p>
                      <div className="mt-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          item.condition === "functional"
                            ? "bg-green-100 text-green-800"
                            : item.condition === "minor_issues"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {item.condition}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCheckout(item.id)}
                      className="ml-4 flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Check Out
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === "my-checkouts" && (
          <>
            {myCheckouts.length === 0 ? (
              <div className="bg-white rounded-lg p-6 text-center shadow-sm">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No equipment checked out</p>
              </div>
            ) : (
              myCheckouts.map((checkout) => (
                <div
                  key={checkout.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {checkout.equipment.name}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">{checkout.equipment.type}</p>
                      {checkout.job && (
                        <p className="text-sm text-gray-600 mt-1">Job: {checkout.job.title}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Checked out: {new Date(checkout.checked_out_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleReturn(checkout.id, "functional")}
                      disabled={returningId === checkout.id}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Return (Good)
                    </button>
                    <button
                      onClick={() => handleReturn(checkout.id, "minor_issues")}
                      disabled={returningId === checkout.id}
                      className="flex-1 flex items-center justify-center gap-2 bg-yellow-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-yellow-700 transition-colors disabled:opacity-50"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Return (Issues)
                    </button>
                    <button
                      onClick={() => handleReportDamage(checkout.id)}
                      className="flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors"
                    >
                      <Wrench className="w-4 h-4" />
                      Report Damage
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}




























