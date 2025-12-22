// Time utility for cadence scheduling with timezone and business hours support

export function nextBusinessMoment(
  base: Date,
  days: number,
  tz = 'America/Los_Angeles',
  window = { start: '08:30', end: '16:30' },
  quietWeekends = true
): Date {
  // Add days, then clamp into window & skip weekends if needed.
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  let local = new Date(d.toLocaleString('en-US', { timeZone: tz }))

  const [sh, sm] = window.start.split(':').map(Number)
  const [eh, em] = window.end.split(':').map(Number)

  const setTime = (date: Date, h: number, m: number) => {
    const z = new Date(date)
    z.setHours(h, m, 0, 0) // local
    return new Date(z.toLocaleString('en-US', { timeZone: 'UTC' })) // back to UTC
  }

  const isWeekend = (date: Date) => [0, 6].includes(date.getDay())
  if (quietWeekends) {
    while (isWeekend(local)) {
      local.setDate(local.getDate() + 1)
    }
  }

  // If out of window, snap to window start
  const mins = local.getHours() * 60 + local.getMinutes()
  const startM = sh * 60 + sm
  const endM = eh * 60 + em
  if (mins < startM) return setTime(local, sh, sm)
  if (mins > endM) {
    local.setDate(local.getDate() + 1)
    if (quietWeekends) {
      while (isWeekend(local)) local.setDate(local.getDate() + 1)
    }
    return setTime(local, sh, sm)
  }
  return new Date(local.toLocaleString('en-US', { timeZone: 'UTC' }))
}

