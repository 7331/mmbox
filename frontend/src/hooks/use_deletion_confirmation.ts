// Asks before something irreversible: `DeletionConfirmationProvider` (components/) shows one AlertDialog, and the
// function this hook returns resolves true only for an explicit yes.
import { createContext, use } from "react"

export interface DeletionQuestion {
  title: string
  message: string
  acceptLabel?: string
}

export type AskForDeletionConfirmation = (deletionQuestion: DeletionQuestion) => Promise<boolean>

export const DeletionConfirmationContext = createContext<AskForDeletionConfirmation>(async () => false)

export function useDeletionConfirmation(): AskForDeletionConfirmation {
  return use(DeletionConfirmationContext)
}
