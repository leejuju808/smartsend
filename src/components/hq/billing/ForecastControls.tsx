'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface ForecastParams {
  growth_pct: number;
  churn_pct: number;
  expansion_pct: number;
  arpa_growth_pct: number;
}

interface ForecastControlsProps {
  onParamsChange: (params: ForecastParams) => void;
}

const PRESETS = {
  conservative: { growth_pct: 0.05, churn_pct: 0.04, expansion_pct: 0.01, arpa_growth_pct: 0.0 },
  base: { growth_pct: 0.08, churn_pct: 0.03, expansion_pct: 0.02, arpa_growth_pct: 0.0 },
  aggressive: { growth_pct: 0.12, churn_pct: 0.02, expansion_pct: 0.04, arpa_growth_pct: 0.0 },
};

export default function ForecastControls({ onParamsChange }: ForecastControlsProps) {
  const supabase = createClientComponentClient();
  const [params, setParams] = useState<ForecastParams>(PRESETS.base);
  const [saving, setSaving] = useState(false);

  // Load saved preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('user_prefs')
          .select('prefs')
          .eq('user_id', user.id)
          .single();

        if (data?.prefs?.forecast_params) {
          const savedParams = data.prefs.forecast_params;
          setParams(savedParams);
          onParamsChange(savedParams);
        } else {
          // Notify parent with default params on mount
          onParamsChange(PRESETS.base);
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
        // Notify parent with default params on error
        onParamsChange(PRESETS.base);
      }
    })();
  }, [supabase, onParamsChange]);

  // Save preferences to database
  const savePreferences = useCallback(async (newParams: ForecastParams) => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('user_prefs')
        .upsert({
          user_id: user.id,
          prefs: { forecast_params: newParams },
          updated_at: new Date().toISOString(),
        });

      onParamsChange(newParams);
    } catch (error) {
      console.error('Error saving preferences:', error);
    } finally {
      setSaving(false);
    }
  }, [supabase, onParamsChange]);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleParamChange = (key: keyof ForecastParams, value: number) => {
    const newParams = { ...params, [key]: value };
    setParams(newParams);
    onParamsChange(newParams);
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new timer for saving
    debounceTimerRef.current = setTimeout(() => {
      savePreferences(newParams);
    }, 500);
  };

  const applyPreset = (presetName: keyof typeof PRESETS) => {
    const preset = PRESETS[presetName];
    setParams(preset);
    savePreferences(preset);
    onParamsChange(preset);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Forecast Inputs & What-Ifs</CardTitle>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => applyPreset('conservative')}
            className="px-3 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
          >
            Conservative
          </button>
          <button
            onClick={() => applyPreset('base')}
            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Base
          </button>
          <button
            onClick={() => applyPreset('aggressive')}
            className="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
          >
            Aggressive
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Growth Rate */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium">Growth %</label>
            <span className="text-sm text-gray-600">{formatPercent(params.growth_pct)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.3"
            step="0.01"
            value={params.growth_pct}
            onChange={(e) => handleParamChange('growth_pct', parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0%</span>
            <span>30%</span>
          </div>
        </div>

        {/* Churn Rate */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium">Churn %</label>
            <span className="text-sm text-gray-600">{formatPercent(params.churn_pct)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.15"
            step="0.01"
            value={params.churn_pct}
            onChange={(e) => handleParamChange('churn_pct', parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0%</span>
            <span>15%</span>
          </div>
        </div>

        {/* Expansion Rate */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium">Expansion %</label>
            <span className="text-sm text-gray-600">{formatPercent(params.expansion_pct)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.2"
            step="0.01"
            value={params.expansion_pct}
            onChange={(e) => handleParamChange('expansion_pct', parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0%</span>
            <span>20%</span>
          </div>
        </div>

        {/* ARPA Growth */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium">ARPA Growth %</label>
            <span className="text-sm text-gray-600">{formatPercent(params.arpa_growth_pct)}</span>
          </div>
          <input
            type="range"
            min="-0.1"
            max="0.1"
            step="0.01"
            value={params.arpa_growth_pct}
            onChange={(e) => handleParamChange('arpa_growth_pct', parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>-10%</span>
            <span>+10%</span>
          </div>
        </div>

        {saving && (
          <div className="text-xs text-gray-500 text-center">Saving...</div>
        )}
      </CardContent>
    </Card>
  );
}

