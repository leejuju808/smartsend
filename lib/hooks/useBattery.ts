'use client'

import { useState, useEffect } from 'react'

interface BatteryStatus {
  level: number | null
  charging: boolean | null
  chargingTime: number | null
  dischargingTime: number | null
  supported: boolean
}

/**
 * Hook to monitor device battery status
 * Returns null values if Battery API is not supported
 */
export function useBattery(): BatteryStatus {
  const [battery, setBattery] = useState<BatteryStatus>({
    level: null,
    charging: null,
    chargingTime: null,
    dischargingTime: null,
    supported: false,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check if Battery API is supported
    const batteryAPI = (navigator as any).getBattery || (navigator as any).battery

    if (!batteryAPI) {
      // Battery API not supported
      return
    }

    const updateBattery = async () => {
      try {
        const battery = await batteryAPI()
        setBattery({
          level: battery.level,
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime,
          supported: true,
        })

        const handleChange = () => {
          setBattery({
            level: battery.level,
            charging: battery.charging,
            chargingTime: battery.chargingTime,
            dischargingTime: battery.dischargingTime,
            supported: true,
          })
        }

        battery.addEventListener('chargingchange', handleChange)
        battery.addEventListener('levelchange', handleChange)
        battery.addEventListener('chargingtimechange', handleChange)
        battery.addEventListener('dischargingtimechange', handleChange)

        return () => {
          battery.removeEventListener('chargingchange', handleChange)
          battery.removeEventListener('levelchange', handleChange)
          battery.removeEventListener('chargingtimechange', handleChange)
          battery.removeEventListener('dischargingtimechange', handleChange)
        }
      } catch (error) {
        console.warn('Battery API not available:', error)
      }
    }

    updateBattery()
  }, [])

  return battery
}

/**
 * Hook to check if device is in low power mode (< 20% battery)
 */
export function useLowPowerMode(): boolean {
  const battery = useBattery()
  
  if (!battery.supported || battery.level === null) {
    return false
  }

  return battery.level < 0.2 && !battery.charging
}



















































