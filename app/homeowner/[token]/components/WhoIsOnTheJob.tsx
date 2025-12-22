"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Phone, Mail } from "lucide-react";
import Image from "next/image";

type TrustFeatures = {
  project_manager_name: string | null;
  project_manager_photo_url: string | null;
  crew_contact_name: string | null;
  crew_contact_phone: string | null;
};

interface WhoIsOnTheJobProps {
  trustFeatures: TrustFeatures | null;
}

export function WhoIsOnTheJob({ trustFeatures }: WhoIsOnTheJobProps) {
  if (!trustFeatures || (!trustFeatures.project_manager_name && !trustFeatures.crew_contact_name)) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Who Is On The Job
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Project Manager */}
        {trustFeatures.project_manager_name && (
          <div className="flex items-start gap-3">
            {trustFeatures.project_manager_photo_url ? (
              <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-gray-200">
                <Image
                  src={trustFeatures.project_manager_photo_url}
                  alt={trustFeatures.project_manager_name}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            )}
            <div className="flex-1">
              <p className="font-semibold text-gray-900">
                {trustFeatures.project_manager_name}
              </p>
              <p className="text-sm text-gray-600">Project Manager</p>
              <p className="text-xs text-gray-500 mt-1">
                Your main point of contact for this project
              </p>
            </div>
          </div>
        )}

        {/* Crew Contact */}
        {trustFeatures.crew_contact_name && (
          <div className="flex items-start gap-3 pt-3 border-t">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">
                {trustFeatures.crew_contact_name}
              </p>
              <p className="text-sm text-gray-600">Crew Lead</p>
              {trustFeatures.crew_contact_phone && (
                <a
                  href={`tel:${trustFeatures.crew_contact_phone}`}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-1"
                >
                  <Phone className="h-4 w-4" />
                  {trustFeatures.crew_contact_phone}
                </a>
              )}
            </div>
          </div>
        )}

        <div className="pt-3 border-t">
          <p className="text-xs text-gray-500">
            Need to reach someone? Use the Messages section above or call the
            crew contact directly.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}






































