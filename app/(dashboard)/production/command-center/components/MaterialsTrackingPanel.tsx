"use client";

// Block 246000 — Materials & Supplier Tracking Panel
// Shows: PO sent, Supplier confirmed, Delivery scheduled, Delivered?, Crew verified?, Discrepancies?

import { Package, CheckCircle, Clock, AlertTriangle, Truck } from "lucide-react";
import Link from "next/link";

interface MaterialEvent {
  id: string;
  event_type: string;
  message: string | null;
  details: any;
  created_at: string;
  job_id: string | null;
  jobs?: {
    id: string;
    title: string;
    address: string;
  } | null;
}

interface Dependency {
  id: string;
  dependency_type: string;
  status: string;
  description: string | null;
  expected_completion_date: string | null;
  job_id: string;
  jobs?: {
    id: string;
    title: string;
    address: string;
  } | null;
}

interface MaterialsTrackingPanelProps {
  materials: MaterialEvent[];
  dependencies: Dependency[];
}

export function MaterialsTrackingPanel({ materials, dependencies }: MaterialsTrackingPanelProps) {
  const materialDependencies = dependencies.filter(d => d.dependency_type === 'materials');
  const recentMaterialEvents = materials.slice(0, 10);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-yellow-400" />;
      case 'blocked':
        return <AlertTriangle className="h-4 w-4 text-red-400" />;
      default:
        return <Clock className="h-4 w-4 text-zinc-400" />;
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'material_delivered':
        return <Truck className="h-4 w-4 text-green-400" />;
      case 'material_ordered':
        return <Package className="h-4 w-4 text-blue-400" />;
      case 'material_shortage':
        return <AlertTriangle className="h-4 w-4 text-red-400" />;
      default:
        return <Package className="h-4 w-4 text-zinc-400" />;
    }
  };

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-orange-400" />
          <h2 className="text-lg font-semibold text-white">Materials & Supplier Tracking</h2>
        </div>
        <div className="text-xs text-zinc-400">
          {materialDependencies.length} material dependencies
        </div>
      </div>

      <div className="space-y-4">
        {/* Material Dependencies */}
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Pending Material Orders</h3>
          <div className="space-y-2">
            {materialDependencies.length === 0 ? (
              <div className="text-center text-zinc-500 text-sm py-4">
                No pending material orders
              </div>
            ) : (
              materialDependencies.slice(0, 5).map((dep) => (
                <div
                  key={dep.id}
                  className="bg-zinc-800/50 rounded-lg border border-zinc-700 p-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {dep.jobs && (
                        <Link href={`/production/jobs/${dep.jobs.id}`}>
                          <div className="font-medium text-white text-sm hover:text-blue-400">
                            {dep.jobs.title || dep.jobs.address}
                          </div>
                        </Link>
                      )}
                      {dep.description && (
                        <div className="text-xs text-zinc-400 mt-1">{dep.description}</div>
                      )}
                      {dep.expected_completion_date && (
                        <div className="text-xs text-zinc-500 mt-1">
                          Expected: {new Date(dep.expected_completion_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(dep.status)}
                      <span className="text-xs text-zinc-400 capitalize">{dep.status}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Material Events */}
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Recent Material Activity</h3>
          <div className="space-y-2">
            {recentMaterialEvents.length === 0 ? (
              <div className="text-center text-zinc-500 text-sm py-4">
                No recent material activity
              </div>
            ) : (
              recentMaterialEvents.map((event) => (
                <div
                  key={event.id}
                  className="bg-zinc-800/50 rounded-lg border border-zinc-700 p-2 flex items-start gap-2"
                >
                  {getEventIcon(event.event_type)}
                  <div className="flex-1 min-w-0">
                    {event.jobs && (
                      <Link href={`/production/jobs/${event.jobs.id}`}>
                        <div className="text-xs font-medium text-white hover:text-blue-400 truncate">
                          {event.jobs.title || event.jobs.address}
                        </div>
                      </Link>
                    )}
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {event.message || event.event_type.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {new Date(event.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

























