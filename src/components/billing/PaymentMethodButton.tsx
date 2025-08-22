'use client'
import { useFormStatus } from 'react-dom'
import { openPaymentMethodUpdatePortal } from '@/app/actions/billing'

export default function PaymentMethodButton() {
  return (
    <form action={openPaymentMethodUpdatePortal}>
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
      {pending ? 'Opening…' : 'Update payment method'}
    </button>
  )
}
