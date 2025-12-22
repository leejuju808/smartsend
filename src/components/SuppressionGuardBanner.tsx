"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, X, CheckCircle, Users, Shield, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SuppressionData {
  total: number;
  suppressed_global: number;
  suppressed_campaign: number;
  invalid: number;
  final_sendable: number;
  blocked: Array<{
    id: string;
    email: string;
    reason: 'suppressed_global' | 'suppressed_campaign' | 'invalid';
    details: string;
  }>;
}

interface SuppressionGuardBannerProps {
  campaignId: string;
  onFixComplete?: () => void;
}

export default function SuppressionGuardBanner({ campaignId, onFixComplete }: SuppressionGuardBannerProps) {
  const [suppressionData, setSuppressionData] = useState<SuppressionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFixList, setShowFixList] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuppressionData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/campaigns/${campaignId}/presend-check`);
      if (!response.ok) {
        throw new Error('Failed to fetch suppression data');
      }
      const data = await response.json();
      setSuppressionData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppressionData();
  }, [campaignId]);

  const handleFixList = async () => {
    if (!suppressionData?.blocked.length) return;

    try {
      setFixing(true);
      const blockedIds = suppressionData.blocked.map(item => item.id);
      
      const response = await fetch(`/api/campaigns/${campaignId}/presend-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exclude_contact_ids: blockedIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to exclude blocked contacts');
      }

      // Refresh the suppression data
      await fetchSuppressionData();
      setShowFixList(false);
      onFixComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fix list');
    } finally {
      setFixing(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600"></div>
            <span className="text-sm text-amber-700">Checking recipient safety...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-sm text-red-700">Error: {error}</span>
            <Button variant="ghost" size="sm" onClick={fetchSuppressionData}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!suppressionData) return null;

  const hasBlocked = suppressionData.suppressed_global + suppressionData.suppressed_campaign + suppressionData.invalid > 0;
  const canSend = suppressionData.final_sendable > 0;

  if (!hasBlocked && suppressionData.total > 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-700">
              ✅ All {suppressionData.total} recipients are safe to send
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (suppressionData.total === 0) {
    return null; // No recipients to check
  }

  return (
    <>
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-amber-800">Send Safety Check</span>
                  <Badge variant="outline" className="text-xs">
                    {hasBlocked ? 'Issues Found' : 'Safe'}
                  </Badge>
                </div>
                
                <div className="text-sm text-amber-700 space-y-1">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{suppressionData.total} total</span>
                    </div>
                    {suppressionData.suppressed_global > 0 && (
                      <div className="flex items-center gap-1">
                        <Shield className="h-3 w-3 text-red-500" />
                        <span>{suppressionData.suppressed_global} globally suppressed</span>
                      </div>
                    )}
                    {suppressionData.suppressed_campaign > 0 && (
                      <div className="flex items-center gap-1">
                        <Shield className="h-3 w-3 text-orange-500" />
                        <span>{suppressionData.suppressed_campaign} campaign suppressed</span>
                      </div>
                    )}
                    {suppressionData.invalid > 0 && (
                      <div className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 text-red-500" />
                        <span>{suppressionData.invalid} invalid emails</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span className="font-medium">
                      {suppressionData.final_sendable} ready to send
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {hasBlocked && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFixList(true)}
                  className="text-amber-700 border-amber-300 hover:bg-amber-100"
                >
                  Fix List
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFixList(false)}
                  className="text-amber-600"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {hasBlocked && (
            <div className="mt-3 pt-3 border-t border-amber-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-600">
                  {canSend 
                    ? `You can send to ${suppressionData.final_sendable} recipients after fixing the list.`
                    : 'Fix the list before sending.'
                  }
                </span>
                {canSend && (
                  <Badge variant="secondary" className="text-xs">
                    Ready to Send
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showFixList && (
        <FixListDrawer
          campaignId={campaignId}
          suppressionData={suppressionData}
          onFix={handleFixList}
          onClose={() => setShowFixList(false)}
          fixing={fixing}
        />
      )}
    </>
  );
}

interface FixListDrawerProps {
  campaignId: string;
  suppressionData: SuppressionData;
  onFix: () => void;
  onClose: () => void;
  fixing: boolean;
}

function FixListDrawer({ suppressionData, onFix, onClose, fixing }: FixListDrawerProps) {
  const groupedBlocked = suppressionData.blocked.reduce((acc, item) => {
    if (!acc[item.reason]) acc[item.reason] = [];
    acc[item.reason].push(item);
    return acc;
  }, {} as Record<string, typeof suppressionData.blocked>);

  const reasonLabels = {
    suppressed_global: 'Globally Suppressed',
    suppressed_campaign: 'Campaign Suppressed', 
    invalid: 'Invalid Email Format'
  };

  const reasonColors = {
    suppressed_global: 'text-red-600 bg-red-50 border-red-200',
    suppressed_campaign: 'text-orange-600 bg-orange-50 border-orange-200',
    invalid: 'text-red-600 bg-red-50 border-red-200'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Fix Recipient List</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Exclude {suppressionData.blocked.length} problematic recipients to proceed with sending
          </p>
        </div>

        <div className="p-4 overflow-y-auto max-h-96 space-y-4">
          {Object.entries(groupedBlocked).map(([reason, items]) => (
            <div key={reason} className="space-y-2">
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${reasonColors[reason as keyof typeof reasonColors]}`}>
                <Shield className="h-3 w-3" />
                {reasonLabels[reason as keyof typeof reasonLabels]} ({items.length})
              </div>
              
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                    <div>
                      <span className="font-medium">{item.email}</span>
                      <div className="text-xs text-gray-500">{item.details}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              After fixing: <span className="font-medium text-green-600">{suppressionData.final_sendable} sendable</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={onFix} 
                disabled={fixing}
                className="bg-green-600 hover:bg-green-700"
              >
                {fixing ? 'Fixing...' : 'Fix List & Continue'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}