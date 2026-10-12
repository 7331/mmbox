// A whole-area button that copies an exact string (a link); "Copied" pops in under it with
// a check that draws itself, plus a short buzz on phones that vibrate, for a moment without moving the layout. With
// `feedbackShownBy="trailing_icon"` its Copy icon turns into the check instead.
import { Copy } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { DrawnCheckPath } from "@/components/drawn_check_path"
import { copyTextToClipboard } from "@/lib/clipboard_and_sharing"
import { vibrateBriefly } from "@/lib/haptic_feedback"
import { popSpring, pressedScale } from "@/lib/motion_presets"
import { cn } from "@/lib/utils"

export function TapToCopyButton({
  textToCopy,
  accessibleLabel,
  children,
  className,
  id,
  testId,
  feedbackShownBy = "floating_tag",
  onCopy,
}: {
  textToCopy: string
  accessibleLabel: string
  children: ReactNode
  className?: string
  id?: string
  testId?: string
  // "floating_tag": "Copied" pops in under the button; "trailing_icon": a Copy icon after the text turns into a check.
  feedbackShownBy?: "floating_tag" | "trailing_icon"
  // Told of every tap, whether or not the browser let the copy through.
  onCopy?(): void
}) {
  const [copyFeedback, setCopyFeedback] = useState("")
  const resetTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(resetTimer.current), [])

  async function copyAndShowFeedback() {
    window.clearTimeout(resetTimer.current)
    onCopy?.()
    try {
      await copyTextToClipboard(textToCopy)
      vibrateBriefly()
      setCopyFeedback("Copied")
    } catch {
      setCopyFeedback("Select it and copy")
    }
    resetTimer.current = window.setTimeout(() => setCopyFeedback(""), 1600)
  }

  return (
    <motion.button
      type="button"
      whileTap={{ scale: pressedScale }}
      id={id}
      data-testid={testId}
      aria-label={accessibleLabel}
      onClick={copyAndShowFeedback}
      className={cn(
        "relative rounded-2xl outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/70",
        className,
      )}
    >
      {children}
      {feedbackShownBy === "trailing_icon" ? (
        <>
          {/* A Copy icon says the text can be copied; it turns into a drawn check in place, covering nothing. */}
          <span aria-hidden="true" className={cn("inline-grid size-5 shrink-0 place-items-center align-middle", copyFeedback === "Copied" ? "text-success" : "text-muted-foreground")}>
            {copyFeedback === "Copied" ? (
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <DrawnCheckPath durationSeconds={0.25} />
              </svg>
            ) : (
              <Copy className="size-4" />
            )}
          </span>
          <span aria-live="polite" className="sr-only">
            {copyFeedback}
          </span>
        </>
      ) : (
      <span aria-live="polite" className="pointer-events-none absolute inset-x-0 -bottom-5 flex justify-center">
        <AnimatePresence>
          {copyFeedback ? (
            <motion.span
              key={copyFeedback}
              initial={{ opacity: 0, y: -4, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 2, transition: { duration: 0.15 } }}
              transition={popSpring}
              className="flex items-center gap-1 rounded-full bg-foreground py-0.5 pr-2 pl-1.5 text-[11px] font-medium text-background"
            >
              {copyFeedback === "Copied" ? (
                <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <DrawnCheckPath durationSeconds={0.25} />
                </svg>
              ) : null}
              {copyFeedback}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
      )}
    </motion.button>
  )
}
