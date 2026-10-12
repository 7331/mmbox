// Asks before something irreversible (deleting a link or a bucket object) in one shared AlertDialog:
// `askForDeletionConfirmation` resolves true only for an explicit yes; closing or "Keep" resolves false.
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"
import { useCallback, useRef, useState, type ReactNode } from "react"

import { ApplicationButton } from "@/components/application_button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DeletionConfirmationContext, type AskForDeletionConfirmation, type DeletionQuestion } from "@/hooks/use_deletion_confirmation"

export function DeletionConfirmationProvider({ children }: { children: ReactNode }) {
  const [openQuestion, setOpenQuestion] = useState<DeletionQuestion | null>(null)
  const [dialogIsOpen, setDialogIsOpen] = useState(false)
  const settleOpenQuestion = useRef<((accepted: boolean) => void) | null>(null)

  const finishConfirmation = useCallback((accepted: boolean) => {
    const settle = settleOpenQuestion.current
    settleOpenQuestion.current = null
    setDialogIsOpen(false)
    settle?.(accepted)
  }, [])

  const askForDeletionConfirmation = useCallback<AskForDeletionConfirmation>(
    (deletionQuestion) => {
      finishConfirmation(false)
      setOpenQuestion(deletionQuestion)
      setDialogIsOpen(true)
      return new Promise((resolve) => {
        settleOpenQuestion.current = resolve
      })
    },
    [finishConfirmation],
  )

  return (
    <DeletionConfirmationContext value={askForDeletionConfirmation}>
      {children}
      <AlertDialog open={dialogIsOpen} onOpenChange={(nextIsOpen) => (nextIsOpen ? undefined : finishConfirmation(false))}>
        <AlertDialogContent data-testid="deletion_confirmation_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{openQuestion?.title}</AlertDialogTitle>
            <AlertDialogDescription>{openQuestion?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Radix's Cancel and Action around app buttons, as shadcn's AlertDialogCancel and AlertDialogAction do around its
                Button: both answers keep the 44 px touch size and the press scale (components/application_button.tsx). */}
            <AlertDialogPrimitive.Cancel asChild>
              <ApplicationButton id="cancel_deletion_button" variant="outline" size="touch">
                Keep
              </ApplicationButton>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <ApplicationButton id="confirm_deletion_button" variant="destructive" size="touch" onClick={() => finishConfirmation(true)}>
                {openQuestion?.acceptLabel ?? "Delete now"}
              </ApplicationButton>
            </AlertDialogPrimitive.Action>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DeletionConfirmationContext>
  )
}
