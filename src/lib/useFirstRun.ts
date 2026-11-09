import { useEffect, useState } from 'react'
import { readLocal, writeLocal } from './safeStorage'

// Helper to detect first run and set a flag
export function useFirstRun(): { firstRun: boolean; setFirstRun: (value: boolean) => void } {
  const [firstRun, setFirstRun] = useState(() => readLocal('babin-first-run') !== 'true')

  useEffect(() => {
    // StrictMode repeats mount effects. Mark the next mount without consuming
    // the current first-run screen when the same effect runs a second time.
    if (firstRun) writeLocal('babin-first-run', 'true')
  }, [firstRun])

  return { firstRun, setFirstRun }
}

// Onboarding step type
export interface OnboardingStep {
  id: string
  title: string
  description: string
  cta?: string
  onCTA?: () => void
}

const DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: 'step1',
    title: 'Welcome to Babin Rentals OS',
    description: 'Manage equipment rentals, track inventory, and handle crew scheduling all in one place.',
  },
  {
    id: 'step2',
    title: 'Create Your First Rental',
    description: 'Start by adding a client, selecting equipment, and setting the rental dates.',
    cta: 'Start Now',
  },
  {
    id: 'step3',
    title: 'Set Delivery & Terms',
    description: 'Configure delivery type, pricing, and payment terms for your rental.',
  },
  {
    id: 'step4',
    title: 'You\'re All Set!',
    description: 'Begin renting equipment and managing your inventory. All data is saved to the cloud.',
  },
]

// Onboarding hook
export function useOnboarding(onComplete: () => void) {
  const { firstRun } = useFirstRun()
  const [currentStep, setCurrentStep] = useState(1)
  const [steps, setSteps] = useState<OnboardingStep[]>([])

  useEffect(() => {
    if (firstRun) {
      setSteps(DEFAULT_STEPS.map((s) => s.id === 'step2' ? { ...s, onCTA: () => setCurrentStep(3) } : s))
    }
  }, [firstRun])

  const completeOnboarding = () => {
    writeLocal('babin-first-run', 'true')
    setCurrentStep(steps.length + 1)
    onComplete()
  }

  return {
    firstRun,
    currentStep,
    steps,
    completeOnboarding,
    isComplete: currentStep > steps.length,
  }
}
