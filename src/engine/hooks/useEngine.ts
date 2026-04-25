import { useEffect, useState } from 'react'
import { getEngine, MealPlanEngine } from '../MealPlanEngine'
import { seedSystemPresets } from '../presets/seedOnFirstRun'

export function useEngine(): MealPlanEngine {
  const [engine] = useState(() => getEngine())
  useEffect(() => {
    void seedSystemPresets()
  }, [])
  return engine
}
