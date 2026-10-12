// Copying a link and opening the system share sheet.

// Throws when the browser refuses; plain http (local testing) falls back to a hidden textarea and execCommand.
export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const temporaryTextarea = document.createElement("textarea")
  temporaryTextarea.value = text
  temporaryTextarea.setAttribute("readonly", "")
  temporaryTextarea.style.position = "fixed"
  temporaryTextarea.style.opacity = "0"
  document.body.appendChild(temporaryTextarea)
  temporaryTextarea.select()
  const copied = document.execCommand("copy")
  temporaryTextarea.remove()
  if (!copied) throw new Error("copy refused")
}

export async function tryCopyTextToClipboard(text: string): Promise<boolean> {
  try {
    await copyTextToClipboard(text)
    return true
  } catch {
    return false
  }
}

export const canOpenShareSheet = (): boolean => typeof navigator.share === "function"

// Resolves "shared", "cancelled" (the visitor closed the sheet) or "failed".
export async function shareLinkWithShareSheet(linkUrl: string): Promise<"shared" | "cancelled" | "failed"> {
  try {
    await navigator.share({ url: linkUrl })
    return "shared"
  } catch (shareError) {
    return (shareError as DOMException).name === "AbortError" ? "cancelled" : "failed"
  }
}
