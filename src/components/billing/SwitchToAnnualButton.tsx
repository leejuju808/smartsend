'use client'
import { useFormStatus } from 'react-dom'
import { switchToAnnual } from '@/app/actions/billing'

export default function SwitchToAnnualButton() {
  return (
    <form action={switchToAnnual}>
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
      className="w-full rounded-2xl bg-indigo-600 text-white py-3 font-semibold disabled:opacity-50"
    >
      {pending ? 'Switching…' : 'Switch to Annual'}
    </button>
  )
}

