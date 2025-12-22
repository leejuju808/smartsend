"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, MapPin, Users, TrendingUp } from "lucide-react";

interface Branch {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  is_active: boolean;
}

export function BranchesList() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBranches();
  }, []);

  async function fetchBranches() {
    try {
      setLoading(true);
      const response = await fetch("/api/branches");
      if (!response.ok) {
        throw new Error("Failed to fetch branches");
      }
      const data = await response.json();
      setBranches(data.branches || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-gray-400">Loading branches...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-12 text-center">
        <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No branches yet</h3>
        <p className="text-gray-400 mb-4">Create your first branch to get started</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {branches.map((branch) => (
        <Link
          key={branch.id}
          href={`/branches/${branch.id}`}
          className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{branch.name}</h3>
                {branch.city && branch.state && (
                  <div className="flex items-center gap-1 text-sm text-gray-400 mt-1">
                    <MapPin className="w-3 h-3" />
                    <span>{branch.city}, {branch.state}</span>
                  </div>
                )}
              </div>
            </div>
            {!branch.is_active && (
              <span className="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded">
                Inactive
              </span>
            )}
          </div>

          {branch.address && (
            <p className="text-sm text-gray-400 mb-2">{branch.address}</p>
          )}

          {branch.phone && (
            <p className="text-sm text-gray-400">{branch.phone}</p>
          )}
        </Link>
      ))}
    </div>
  );
}





















