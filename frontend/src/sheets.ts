/** Bottom sheets: native <dialog> elements styled as sheets, plus the shared delete confirmation. */

const confirmSheet = document.getElementById("confirmSheet") as HTMLDialogElement;
const confirmTitle = document.getElementById("confirmTitle") as HTMLElement;
const confirmMessage = document.getElementById("confirmMessage") as HTMLElement;
const confirmAccept = document.getElementById("confirmAccept") as HTMLButtonElement;
const confirmCancel = document.getElementById("confirmCancel") as HTMLButtonElement;

let settleConfirmation: ((accepted: boolean) => void) | null = null;

/** A tap on the dimmed backdrop (outside the sheet's box) closes it, like a native sheet. */
export function closeSheetOnBackdropTap(sheet: HTMLDialogElement): void {
  sheet.addEventListener("click", (event) => {
    if (event.target !== sheet) return;
    const box = sheet.getBoundingClientRect();
    const inside =
      event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) sheet.close();
  });
}

export interface DeletionQuestion {
  title: string;
  message: string;
  acceptLabel?: string;
}

/** Asks before something irreversible; resolves true only for an explicit yes. */
export function confirmDeletion(question: DeletionQuestion): Promise<boolean> {
  settleConfirmation?.(false);
  confirmTitle.textContent = question.title;
  confirmMessage.textContent = question.message;
  confirmAccept.textContent = question.acceptLabel ?? "Delete now";
  confirmSheet.showModal();
  return new Promise((resolve) => {
    settleConfirmation = resolve;
  });
}

function finishConfirmation(accepted: boolean): void {
  const settle = settleConfirmation;
  settleConfirmation = null;
  if (confirmSheet.open) confirmSheet.close();
  settle?.(accepted);
}

confirmAccept.addEventListener("click", () => finishConfirmation(true));
confirmCancel.addEventListener("click", () => finishConfirmation(false));
confirmSheet.addEventListener("close", () => finishConfirmation(false));
closeSheetOnBackdropTap(confirmSheet);
