'use client'
import { useFormStatus } from 'react-dom'
import { scheduleSwitchToMonthlyAtRenewal } from '@/app/actions/billing'

export default function SwitchToMonthlyAtRenewalButton() {
  return (
    <form action={scheduleSwitchToMonthlyAtRenewal}>
      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-2xl bg-slate-900 text-white py-3 font-semibold disabled:opacity-50"
    >
      {pending ? 'Scheduling…' : 'Switch to Monthly at Renewal'}
    </button>
  )
}

