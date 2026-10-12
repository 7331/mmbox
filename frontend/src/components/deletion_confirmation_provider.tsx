// Asks before something irreversible (deleting a link or a bucket object) in one shared AlertDialog:
// `askForDeletionConfirmation` resolves true only for an explicit yes; closing or "Keep" resolves false.
import { useCallback, useRef, useState, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
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
            <AlertDialogCancel id="cancel_deletion_button">Keep</AlertDialogCancel>
            <AlertDialogAction id="confirm_deletion_button" variant="destructive" onClick={() => finishConfirmation(true)}>
              {openQuestion?.acceptLabel ?? "Delete now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DeletionConfirmationContext>
  )
}
