"use client";

import { Building2, MapPin, Phone, Users, Wrench, TrendingUp } from "lucide-react";
import { BranchUsersList } from "./BranchUsersList";
import { BranchResourcesList } from "./BranchResourcesList";
import { BranchPerformanceChart } from "./BranchPerformanceChart";

interface BranchDetailProps {
  branch: any;
  users: any[];
  resources: any[];
}

export function BranchDetail({ branch, users, resources }: BranchDetailProps) {
  return (
    <div className="space-y-6">
      {/* Branch Header */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{branch.name}</h1>
              {branch.city && branch.state && (
                <div className="flex items-center gap-1 text-gray-400 mt-1">
                  <MapPin className="w-4 h-4" />
                  <span>{branch.city}, {branch.state}</span>
                </div>
              )}
            </div>
          </div>
          {!branch.is_active && (
            <span className="px-3 py-1 text-sm bg-gray-700 text-gray-400 rounded">
              Inactive
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {branch.address && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Address</p>
              <p className="text-sm text-white">{branch.address}</p>
            </div>
          )}
          {branch.phone && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Phone</p>
              <div className="flex items-center gap-1 text-sm text-white">
                <Phone className="w-3 h-3" />
                <span>{branch.phone}</span>
              </div>
            </div>
          )}
          {branch.zip_code && (
            <div>
              <p className="text-xs text-gray-400 mb-1">ZIP Code</p>
              <p className="text-sm text-white">{branch.zip_code}</p>
            </div>
          )}
          {branch.territory_zip_codes && branch.territory_zip_codes.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Service Area</p>
              <p className="text-sm text-white">
                {branch.territory_zip_codes.length} ZIP codes
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Performance Chart */}
      <BranchPerformanceChart branchId={branch.id} />

      {/* Users Section */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Branch Users</h2>
          </div>
        </div>
        <BranchUsersList branchId={branch.id} initialUsers={users} />
      </div>

      {/* Resources Section */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Branch Resources</h2>
          </div>
        </div>
        <BranchResourcesList branchId={branch.id} initialResources={resources} />
      </div>
    </div>
  );
}





















