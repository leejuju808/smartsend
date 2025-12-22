"use client";

// Block 200000 — Roof Measurements & Materials Section

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ruler, Package } from "lucide-react";

type RoofMeasurement = {
  total_squares: number | null;
  squares_min: number | null;
  squares_max: number | null;
  pitch_value: string | null;
  pitch_category: string | null;
  ridges_linear_ft: number | null;
  valleys_linear_ft: number | null;
  rakes_linear_ft: number | null;
  eaves_linear_ft: number | null;
  waste_factor_percent: number | null;
  complexity_rating: string | null;
};

type Materials = {
  bundles: number | null;
  ridge_bundles: number | null;
  underlayment: string | null;
  drip_edge: number | null;
  ice_water_shield: number | null;
  materials_list: string[] | null;
};

export function MeasurementsSection({
  measurement,
  materials,
}: {
  measurement: RoofMeasurement | null;
  materials: Materials | null;
}) {
  return (
    <>
      {/* Measurements */}
      {measurement && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Roof Measurement Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {measurement.total_squares && (
                <div>
                  <p className="text-sm text-gray-600">Total Squares</p>
                  <p className="text-2xl font-bold mt-1">{measurement.total_squares}</p>
                  {measurement.squares_min && measurement.squares_max && (
                    <p className="text-xs text-gray-500">
                      ({measurement.squares_min}-{measurement.squares_max} range)
                    </p>
                  )}
                </div>
              )}
              {measurement.pitch_value && (
                <div>
                  <p className="text-sm text-gray-600">Pitch</p>
                  <p className="text-2xl font-bold mt-1">{measurement.pitch_value}</p>
                  {measurement.pitch_category && (
                    <p className="text-xs text-gray-500 capitalize">
                      {measurement.pitch_category} slope
                    </p>
                  )}
                </div>
              )}
              {measurement.eaves_linear_ft && (
                <div>
                  <p className="text-sm text-gray-600">Eaves</p>
                  <p className="text-2xl font-bold mt-1">{measurement.eaves_linear_ft} ft</p>
                </div>
              )}
              {measurement.ridges_linear_ft && (
                <div>
                  <p className="text-sm text-gray-600">Ridge</p>
                  <p className="text-2xl font-bold mt-1">{measurement.ridges_linear_ft} ft</p>
                </div>
              )}
            </div>

            {(measurement.valleys_linear_ft ||
              measurement.rakes_linear_ft ||
              measurement.waste_factor_percent) && (
              <div className="mt-6 pt-6 border-t grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {measurement.valleys_linear_ft && (
                  <div>
                    <p className="text-gray-600">Valleys</p>
                    <p className="font-semibold">{measurement.valleys_linear_ft} ft</p>
                  </div>
                )}
                {measurement.rakes_linear_ft && (
                  <div>
                    <p className="text-gray-600">Rakes</p>
                    <p className="font-semibold">{measurement.rakes_linear_ft} ft</p>
                  </div>
                )}
                {measurement.waste_factor_percent && (
                  <div>
                    <p className="text-gray-600">Waste Factor</p>
                    <p className="font-semibold">{measurement.waste_factor_percent}%</p>
                  </div>
                )}
              </div>
            )}

            {measurement.complexity_rating && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-600">Complexity Rating</p>
                <p className="font-semibold capitalize">{measurement.complexity_rating}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Materials */}
      {materials && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Materials & Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(materials.bundles || materials.ridge_bundles) && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                {materials.bundles && (
                  <div>
                    <p className="text-sm text-gray-600">Shingle Bundles</p>
                    <p className="text-2xl font-bold mt-1">{materials.bundles}</p>
                  </div>
                )}
                {materials.ridge_bundles && (
                  <div>
                    <p className="text-sm text-gray-600">Ridge Bundles</p>
                    <p className="text-2xl font-bold mt-1">{materials.ridge_bundles}</p>
                  </div>
                )}
              </div>
            )}

            {(materials.underlayment ||
              materials.drip_edge ||
              materials.ice_water_shield ||
              materials.materials_list) && (
              <div className="space-y-2 text-sm">
                {materials.underlayment && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Underlayment</span>
                    <span className="font-semibold">{materials.underlayment}</span>
                  </div>
                )}
                {materials.drip_edge && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Drip Edge</span>
                    <span className="font-semibold">{materials.drip_edge} linear ft</span>
                  </div>
                )}
                {materials.ice_water_shield && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ice & Water Shield</span>
                    <span className="font-semibold">{materials.ice_water_shield} squares</span>
                  </div>
                )}
                {materials.materials_list && materials.materials_list.length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-gray-600 mb-2">Additional Materials</p>
                    <ul className="list-disc list-inside space-y-1">
                      {materials.materials_list.map((item, idx) => (
                        <li key={idx} className="text-sm">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}


























