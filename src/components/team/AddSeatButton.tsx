'use client'
import { useFormStatus } from 'react-dom'
import { startSeatUpgrade } from '@/app/actions/seats'

export default function AddSeatButton({ currentSeats }: { currentSeats: number }) {
  return (
    <form action={startSeatUpgrade} className="flex items-center gap-2">
      <input type="hidden" name="seats" value={Math.max(2, currentSeats + 1)} />
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
      className="rounded-lg bg-black text-white text-sm px-3 py-2 disabled:opacity-50"
    >
      {pending ? 'Updating…' : 'Add seat'}
    </button>
  )
}

