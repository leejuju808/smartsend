"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Download, Calendar, Package, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type WarrantyPackage = {
  id: string;
  status: string;
  install_date: string | null;
  smart_send_job_id: string | null;
  homeowner_portal_link: string | null;
  shingle_brand: string | null;
  shingle_color: string | null;
  crew_info: Record<string, any>;
  ventilation_details: string | null;
  underlayment_details: string | null;
  documents: Array<{
    type: string;
    name: string;
    url: string | null;
  }>;
  before_photos: Array<{
    id: string;
    name: string;
    url: string | null;
  }>;
  after_photos: Array<{
    id: string;
    name: string;
    url: string | null;
  }>;
  generated_at: string | null;
  delivered_at: string | null;
};

interface WarrantyPackageSectionProps {
  warrantyPackage: WarrantyPackage | null;
}

export function WarrantyPackageSection({
  warrantyPackage,
}: WarrantyPackageSectionProps) {
  if (!warrantyPackage) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready":
      case "delivered":
        return <Badge className="bg-green-100 text-green-800">Ready</Badge>;
      case "generating":
        return <Badge className="bg-yellow-100 text-yellow-800">Generating</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  return (
    <Card className="border-2 border-blue-200 bg-blue-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          Warranty Package
        </CardTitle>
        <div className="flex items-center gap-2 mt-2">
          {getStatusBadge(warrantyPackage.status)}
          {warrantyPackage.smart_send_job_id && (
            <span className="text-sm text-gray-600">
              Job ID: {warrantyPackage.smart_send_job_id}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Installation Details */}
        {(warrantyPackage.install_date ||
          warrantyPackage.shingle_brand ||
          warrantyPackage.shingle_color) && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-gray-700">Installation Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {warrantyPackage.install_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-600">
                    Install Date:{" "}
                    {new Date(warrantyPackage.install_date).toLocaleDateString()}
                  </span>
                </div>
              )}
              {warrantyPackage.shingle_brand && (
                <div>
                  <span className="text-gray-600">Brand: </span>
                  <span className="font-medium">{warrantyPackage.shingle_brand}</span>
                </div>
              )}
              {warrantyPackage.shingle_color && (
                <div>
                  <span className="text-gray-600">Color: </span>
                  <span className="font-medium">{warrantyPackage.shingle_color}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Warranty Documents */}
        {warrantyPackage.documents.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Warranty Documents
            </h4>
            <div className="space-y-2">
              {warrantyPackage.documents.map((doc, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-white rounded border border-gray-200"
                >
                  <span className="text-sm font-medium text-gray-900">
                    {doc.name}
                  </span>
                  {doc.url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(doc.url!, "_blank")}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Before/After Photos */}
        {(warrantyPackage.before_photos.length > 0 ||
          warrantyPackage.after_photos.length > 0) && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Job Photos
            </h4>
            {warrantyPackage.before_photos.length > 0 && (
              <div>
                <p className="text-xs text-gray-600 mb-1">Before Photos</p>
                <div className="grid grid-cols-3 gap-2">
                  {warrantyPackage.before_photos.slice(0, 3).map((photo) => (
                    <div
                      key={photo.id}
                      className="relative aspect-square rounded border border-gray-200 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => photo.url && window.open(photo.url, "_blank")}
                    >
                      {photo.url ? (
                        <img
                          src={photo.url}
                          alt={photo.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                          <FileText className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {warrantyPackage.after_photos.length > 0 && (
              <div>
                <p className="text-xs text-gray-600 mb-1">After Photos</p>
                <div className="grid grid-cols-3 gap-2">
                  {warrantyPackage.after_photos.slice(0, 3).map((photo) => (
                    <div
                      key={photo.id}
                      className="relative aspect-square rounded border border-gray-200 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => photo.url && window.open(photo.url, "_blank")}
                    >
                      {photo.url ? (
                        <img
                          src={photo.url}
                          alt={photo.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                          <FileText className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Additional Details */}
        {(warrantyPackage.ventilation_details ||
          warrantyPackage.underlayment_details) && (
          <div className="space-y-2 pt-2 border-t border-gray-200">
            <h4 className="font-semibold text-sm text-gray-700">Additional Details</h4>
            {warrantyPackage.ventilation_details && (
              <p className="text-sm text-gray-600">
                <strong>Ventilation:</strong> {warrantyPackage.ventilation_details}
              </p>
            )}
            {warrantyPackage.underlayment_details && (
              <p className="text-sm text-gray-600">
                <strong>Underlayment:</strong> {warrantyPackage.underlayment_details}
              </p>
            )}
          </div>
        )}

        {/* Portal Link */}
        {warrantyPackage.homeowner_portal_link && (
          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-600 mb-2">
              Save this link to access your warranty package anytime:
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                window.open(
                  `${window.location.origin}${warrantyPackage.homeowner_portal_link}`,
                  "_blank"
                )
              }
            >
              <Package className="h-4 w-4 mr-2" />
              Open Warranty Portal
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}




































