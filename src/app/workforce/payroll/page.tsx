'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Lock, AlertTriangle, Calendar, DollarSign, Clock } from 'lucide-react'
import type { PayrollEmployeeSummary, PayrollPeriod, PayrollDiscrepancy } from '@/types/database'

export default function PayrollPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PayrollPeriod | null>(null)
  const [employeeSummaries, setEmployeeSummaries] = useState<PayrollEmployeeSummary[]>([])
  const [discrepancies, setDiscrepancies] = useState<PayrollDiscrepancy[]>([])
  const [totalHours, setTotalHours] = useState(0)
  const [totalPay, setTotalPay] = useState(0)
  const [weekStart, setWeekStart] = useState<string>('')
  const [finalizing, setFinalizing] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    // Set default week to current week
    const today = new Date()
    const weekStartDate = new Date(today)
    weekStartDate.setDate(today.getDate() - today.getDay()) // Sunday
    const weekStartStr = weekStartDate.toISOString().split('T')[0]
    setWeekStart(weekStartStr)
    loadPayrollData(weekStartStr)
  }, [])

  const loadPayrollData = async (weekStartParam?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (weekStartParam) {
        params.append('week_start', weekStartParam)
      } else if (weekStart) {
        params.append('week_start', weekStart)
      }

      const res = await fetch(`/api/workforce/payroll?${params.toString()}`)
      const data = await res.json()

      setPeriod(data.period)
      setEmployeeSummaries(data.employee_summaries || [])
      setDiscrepancies(data.discrepancies || [])
      setTotalHours(data.total_hours || 0)
      setTotalPay(data.total_pay || 0)
    } catch (error) {
      console.error('Error loading payroll data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleWeekChange = (newWeekStart: string) => {
    setWeekStart(newWeekStart)
    loadPayrollData(newWeekStart)
  }

  const handleFinalize = async () => {
    if (!period || !confirm('Are you sure you want to finalize this payroll period? This will lock it and prevent further changes.')) {
      return
    }

    setFinalizing(true)
    try {
      const res = await fetch('/api/workforce/payroll/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: period.id }),
      })

      if (res.ok) {
        const data = await res.json()
        setPeriod(data.period)
        loadPayrollData(weekStart)
        alert('Payroll finalized successfully!')
      } else {
        const error = await res.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error finalizing payroll:', error)
      alert('Failed to finalize payroll')
    } finally {
      setFinalizing(false)
    }
  }

  const handleExport = async () => {
    if (!period) return

    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.append('period_id', period.id)

      const res = await fetch(`/api/workforce/payroll/export?${params.toString()}`)
      
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `payroll_${period.week_start}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        const error = await res.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error exporting payroll:', error)
      alert('Failed to export payroll')
    } finally {
      setExporting(false)
    }
  }

  const getDiscrepancyIcon = (type: PayrollDiscrepancy['type']) => {
    switch (type) {
      case 'missing_clock_out':
        return '🚨'
      case 'over_14_hours':
        return '⚠️'
      case 'multiple_clock_ins':
        return '🔴'
      case 'gps_mismatch':
        return '📍'
      default:
        return '⚠️'
    }
  }

  const getDiscrepancyColor = (type: PayrollDiscrepancy['type']) => {
    switch (type) {
      case 'missing_clock_out':
        return 'bg-red-100 text-red-800'
      case 'over_14_hours':
        return 'bg-yellow-100 text-yellow-800'
      case 'multiple_clock_ins':
        return 'bg-orange-100 text-orange-800'
      case 'gps_mismatch':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-12">Loading payroll data...</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-600 mt-1">
            Weekly payroll summary and export
          </p>
        </div>
        <div className="flex items-center gap-3">
          {period && period.status === 'open' && (
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              <Lock className="mr-2 h-4 w-4" />
              {finalizing ? 'Finalizing...' : 'Finalize Payroll Week'}
            </button>
          )}
          {period && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}
        </div>
      </div>

      {/* Week Selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Week:</label>
        <input
          type="date"
          value={weekStart}
          onChange={(e) => handleWeekChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        {period && (
          <span className="text-sm text-gray-600">
            {new Date(period.week_start).toLocaleDateString()} - {new Date(period.week_end).toLocaleDateString()}
          </span>
        )}
        {period && (
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            period.status === 'locked' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {period.status === 'locked' ? 'Locked' : 'Open'}
          </span>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Hours</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{totalHours.toFixed(1)}</p>
            </div>
            <Clock className="h-8 w-8 text-gray-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Pay</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">${totalPay.toFixed(2)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-gray-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Discrepancies</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{discrepancies.length}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
          </div>
        </div>
      </div>

      {/* Discrepancies Alert */}
      {discrepancies.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                {discrepancies.length} Payroll Discrepancy{discrepancies.length !== 1 ? 'ies' : ''} Found
              </h3>
              <div className="mt-2 space-y-1">
                {discrepancies.slice(0, 5).map((d, idx) => (
                  <div key={idx} className="text-sm text-yellow-700">
                    {getDiscrepancyIcon(d.type)} {d.employee_name}: {d.details}
                  </div>
                ))}
                {discrepancies.length > 5 && (
                  <div className="text-sm text-yellow-600">
                    + {discrepancies.length - 5} more...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Payroll Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Employee Payroll Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Hours
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Regular
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Overtime
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Pay
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issues
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employeeSummaries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                    No payroll data for this week
                  </td>
                </tr>
              ) : (
                employeeSummaries.map((summary) => (
                  <tr key={summary.employee_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {summary.employee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {summary.role}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {summary.total_hours.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {summary.regular_hours.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {summary.overtime_hours.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      ${summary.total_pay.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        summary.status === 'finalized'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {summary.status === 'finalized' ? 'Finalized' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {summary.discrepancies.length > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-red-600">{summary.discrepancies.length}</span>
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
























