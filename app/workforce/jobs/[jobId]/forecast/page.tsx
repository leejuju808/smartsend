'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Users,
  Package,
  Building2,
  AlertCircle,
  Info,
  BarChart3
} from 'lucide-react'

type Forecast = {
  id: string
  job_id: string
  predicted_material_cost: number
  predicted_labor_cost: number
  predicted_sub_cost: number
  predicted_overhead_cost: number
  predicted_total_cost: number
  contract_price: number
  predicted_profit: number
  predicted_margin: number
  risk_level: 'low' | 'medium' | 'high'
  risk_score: number
  confidence_score: number
  forecast_inputs: any
  created_at: string
  updated_at: string
}

type RiskFactor = {
  id: string
  job_id: string
  forecast_id: string
  factor: string
  severity: number
  description: string | null
}

export default function JobForecastPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [riskFactors, setRiskFactors] = useState<RiskFactor[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    loadForecast()
  }, [jobId])

  const loadForecast = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/workforce/jobs/${jobId}/forecast`)
      const data = await res.json()
      
      if (res.ok) {
        setForecast(data.forecast)
        setRiskFactors(data.riskFactors || [])
      }
    } catch (error) {
      console.error('Error loading forecast:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/workforce/jobs/${jobId}/forecast`, {
        method: 'POST',
      })
      const data = await res.json()
      
      if (res.ok) {
        setForecast(data.forecast)
        setRiskFactors(data.riskFactors || [])
      } else {
        alert(data.error || 'Failed to generate forecast')
      }
    } catch (error) {
      console.error('Error generating forecast:', error)
      alert('Failed to generate forecast')
    } finally {
      setGenerating(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'high':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-200">
            <AlertTriangle className="mr-1 h-4 w-4" />
            High Risk
          </span>
        )
      case 'medium':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
            <AlertCircle className="mr-1 h-4 w-4" />
            Medium Risk
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckCircle2 className="mr-1 h-4 w-4" />
            Low Risk
          </span>
        )
    }
  }

  const getConfidenceBadge = (score: number) => {
    if (score >= 80) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
          {score}% Confidence (Good)
        </span>
      )
    } else if (score >= 60) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
          {score}% Confidence (Fair)
        </span>
      )
    } else {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
          {score}% Confidence (Low)
        </span>
      )
    }
  }

  const getSeverityColor = (severity: number) => {
    if (severity >= 4) return 'text-red-600 bg-red-50 border-red-200'
    if (severity >= 3) return 'text-orange-600 bg-orange-50 border-orange-200'
    return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-gray-500">Loading forecast...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/workforce/jobs/${jobId}`}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Job
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Job Cost Forecast</h1>
          <p className="text-sm text-gray-600 mt-1">
            Predicted costs, margins, and risks before job starts
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Generating...' : forecast ? 'Regenerate Forecast' : 'Generate Forecast'}
        </button>
      </div>

      {!forecast ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Forecast Available</h3>
          <p className="text-gray-600 mb-6">
            Generate a cost forecast to see predicted costs, margins, and risks for this job.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            Generate Forecast
          </button>
        </div>
      ) : (
        <>
          {/* Forecast Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Predicted Profit */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-500">Predicted Profit</p>
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <p className={`text-3xl font-bold ${forecast.predicted_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(forecast.predicted_profit)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {forecast.predicted_profit >= 0 ? 'Expected profit' : 'Expected loss'}
              </p>
            </div>

            {/* Predicted Margin */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-500">Predicted Margin</p>
                <BarChart3 className="h-5 w-5 text-blue-600" />
              </div>
              <p className={`text-3xl font-bold ${forecast.predicted_margin >= 30 ? 'text-green-600' : forecast.predicted_margin >= 20 ? 'text-yellow-600' : 'text-red-600'}`}>
                {forecast.predicted_margin.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {forecast.predicted_margin >= 30 ? 'Excellent' : forecast.predicted_margin >= 20 ? 'Good' : 'Low margin'}
              </p>
            </div>

            {/* Risk Level */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-500">Risk Level</p>
                <AlertTriangle className={`h-5 w-5 ${forecast.risk_level === 'high' ? 'text-red-600' : forecast.risk_level === 'medium' ? 'text-yellow-600' : 'text-green-600'}`} />
              </div>
              <div className="mb-2">
                {getRiskBadge(forecast.risk_level)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Risk Score: {forecast.risk_score}/100
              </p>
            </div>

            {/* Confidence Score */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-500">Confidence</p>
                <Info className="h-5 w-5 text-gray-400" />
              </div>
              <div className="mb-2">
                {getConfidenceBadge(forecast.confidence_score)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Forecast accuracy indicator
              </p>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Cost Breakdown</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {/* Materials */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-900">Materials</p>
                      <p className="text-sm text-gray-500">Shingles, accessories, waste factor</p>
                    </div>
                  </div>
                  <p className="text-xl font-semibold text-gray-900">
                    {formatCurrency(forecast.predicted_material_cost)}
                  </p>
                </div>

                {/* Labor */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-gray-900">Labor</p>
                      <p className="text-sm text-gray-500">Crew hours × hourly rate</p>
                    </div>
                  </div>
                  <p className="text-xl font-semibold text-gray-900">
                    {formatCurrency(forecast.predicted_labor_cost)}
                  </p>
                </div>

                {/* Subcontractors */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-purple-600" />
                    <div>
                      <p className="font-medium text-gray-900">Subcontractors</p>
                      <p className="text-sm text-gray-500">Sub work based on averages</p>
                    </div>
                  </div>
                  <p className="text-xl font-semibold text-gray-900">
                    {formatCurrency(forecast.predicted_sub_cost)}
                  </p>
                </div>

                {/* Overhead */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-orange-600" />
                    <div>
                      <p className="font-medium text-gray-900">Overhead</p>
                      <p className="text-sm text-gray-500">Allocated overhead share</p>
                    </div>
                  </div>
                  <p className="text-xl font-semibold text-gray-900">
                    {formatCurrency(forecast.predicted_overhead_cost)}
                  </p>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                  <div>
                    <p className="font-semibold text-gray-900">Total Predicted Cost</p>
                    <p className="text-sm text-gray-600">Sum of all cost categories</p>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">
                    {formatCurrency(forecast.predicted_total_cost)}
                  </p>
                </div>

                {/* Contract Price vs Total Cost */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">Contract Price</p>
                    <p className="text-sm text-gray-500">Job revenue</p>
                  </div>
                  <p className="text-xl font-semibold text-gray-900">
                    {formatCurrency(forecast.contract_price)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Analysis */}
          {riskFactors.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Risk Analysis</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Factors that may impact job cost, timeline, or safety
                </p>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {riskFactors.map((factor) => (
                    <div
                      key={factor.id}
                      className={`p-4 rounded-lg border ${getSeverityColor(factor.severity)}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium capitalize">
                              {factor.factor.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs font-semibold">
                              Severity: {factor.severity}/5
                            </span>
                          </div>
                          {factor.description && (
                            <p className="text-sm mt-1">{factor.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Low Confidence Warning */}
          {forecast.confidence_score < 60 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-orange-900 mb-1">
                    Low Forecast Confidence
                  </h3>
                  <p className="text-sm text-orange-800">
                    Forecast accuracy is low due to missing job details. Add full material list, 
                    roof measurements, and pitch information for better predictions.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* High Risk Warning */}
          {forecast.risk_level === 'high' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-red-900 mb-1">
                    🚨 High Risk Job Alert
                  </h3>
                  <p className="text-sm text-red-800 mb-2">
                    This job has multiple high-risk factors that may impact cost, timeline, or safety.
                    Review risk factors above and consider:
                  </p>
                  <ul className="text-sm text-red-800 list-disc list-inside space-y-1">
                    <li>Assigning your most experienced crew</li>
                    <li>Adding buffer time to the schedule</li>
                    <li>Ordering materials early</li>
                    <li>Preparing for potential delays</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Forecast Metadata */}
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">
              Forecast generated: {new Date(forecast.created_at).toLocaleString()}
              {forecast.updated_at !== forecast.created_at && (
                <span> · Last updated: {new Date(forecast.updated_at).toLocaleString()}</span>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
























