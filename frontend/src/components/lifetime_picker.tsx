// "Delete after": three presets and Custom, any lifetime from a minute to a week (owner, 2026-10-12: "We can do any
// time to expire ... I meant preselect ones"). The server checks the same bounds (backend media/enums.py).
import { useState } from "react"

import { SlidingSelectionPill } from "@/components/sliding_selection_pill"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatDayAndTime } from "@/lib/display_formatting"
import {
  lifetimePresets,
  lifetimeUnits,
  maximumLifetimeSeconds,
  minimumLifetimeSeconds,
  type LifetimeUnit,
} from "@/lib/media_upload_types"

const customChoiceValue = "custom"
const customLifetimeRangeMessage = "Pick between 1 minute and 7 days."

// One row of one outline: square inner corners, round outer ones; a segment shrinks a touch while pressed, like the
// app's buttons (components/application_button.tsx).
function segmentClassName(segmentIndex: number, segmentCount: number): string {
  const outerCorners = segmentIndex === 0 ? "rounded-l-lg! border-l!" : segmentIndex === segmentCount - 1 ? "rounded-r-lg!" : ""
  return `relative h-11 rounded-none! border-l-0 text-[15px] font-medium motion-safe:active:scale-[0.97] data-[state=on]:bg-transparent data-[state=on]:text-background ${outerCorners}`
}

// The largest unit that holds the lifetime whole: 2 days, not 48 hours.
function pickUnitForLifetime(lifetimeSeconds: number): LifetimeUnit {
  return [...lifetimeUnits].reverse().find((lifetimeUnit) => lifetimeSeconds % lifetimeUnit.seconds === 0) ?? lifetimeUnits[0]
}

function readCustomLifetimeSeconds(amountText: string, lifetimeUnit: LifetimeUnit): number | null {
  const amount = Number(amountText.replace(",", "."))
  if (amountText.trim() === "" || !Number.isFinite(amount) || amount <= 0) return null
  const lifetimeSeconds = Math.round(amount * lifetimeUnit.seconds)
  return lifetimeSeconds >= minimumLifetimeSeconds && lifetimeSeconds <= maximumLifetimeSeconds ? lifetimeSeconds : null
}

export function LifetimePicker({
  selectedLifetimeSeconds,
  currentTime,
  onSelectLifetime,
  onCustomLifetimeValidityChange,
}: {
  selectedLifetimeSeconds: number
  currentTime: number
  onSelectLifetime: (lifetimeSeconds: number) => void
  onCustomLifetimeValidityChange: (customLifetimeIsValid: boolean) => void
}) {
  const selectedIsPreset = lifetimePresets.some((lifetimePreset) => lifetimePreset.seconds === selectedLifetimeSeconds)
  const startingUnit = pickUnitForLifetime(selectedLifetimeSeconds)
  const [customIsChosen, setCustomIsChosen] = useState(!selectedIsPreset)
  const [customAmountText, setCustomAmountText] = useState(String(selectedLifetimeSeconds / startingUnit.seconds))
  const [customUnit, setCustomUnit] = useState<LifetimeUnit>(startingUnit)
  const [customLifetimeError, setCustomLifetimeError] = useState("")

  function applyCustomLifetime(amountText: string, lifetimeUnit: LifetimeUnit) {
    setCustomAmountText(amountText)
    setCustomUnit(lifetimeUnit)
    const customLifetimeSeconds = readCustomLifetimeSeconds(amountText, lifetimeUnit)
    setCustomLifetimeError(customLifetimeSeconds === null ? customLifetimeRangeMessage : "")
    onCustomLifetimeValidityChange(customLifetimeSeconds !== null)
    if (customLifetimeSeconds !== null) onSelectLifetime(customLifetimeSeconds)
  }

  function chooseLifetime(pickedValue: string) {
    if (!pickedValue) return
    if (pickedValue === customChoiceValue) {
      setCustomIsChosen(true)
      applyCustomLifetime(customAmountText, customUnit)
      return
    }
    setCustomIsChosen(false)
    setCustomLifetimeError("")
    onCustomLifetimeValidityChange(true)
    onSelectLifetime(Number(pickedValue))
  }

  const choiceValues = [...lifetimePresets.map((lifetimePreset) => String(lifetimePreset.seconds)), customChoiceValue]
  const chosenValue = customIsChosen ? customChoiceValue : String(selectedLifetimeSeconds)

  return (
    <div id="lifetime_section" className="flex flex-col gap-2">
      <h2 id="lifetime_heading" className="text-sm font-medium">
        Delete after
      </h2>
      <ToggleGroup
        id="lifetime_choices"
        type="single"
        variant="outline"
        spacing={0}
        value={chosenValue}
        onValueChange={chooseLifetime}
        aria-labelledby="lifetime_heading"
        className="grid w-full grid-cols-4"
      >
        {choiceValues.map((choiceValue, choiceIndex) => (
          <ToggleGroupItem
            key={choiceValue}
            value={choiceValue}
            data-testid={`lifetime_choice_${choiceValue}`}
            className={segmentClassName(choiceIndex, choiceValues.length)}
          >
            {chosenValue === choiceValue ? <SlidingSelectionPill layoutId="lifetime_selected_pill" /> : null}
            <span className="relative">
              {lifetimePresets.find((lifetimePreset) => String(lifetimePreset.seconds) === choiceValue)?.label ?? "Custom"}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {customIsChosen ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Input
              id="custom_lifetime_amount_input"
              aria-label="How many"
              inputMode="decimal"
              autoComplete="off"
              value={customAmountText}
              aria-invalid={customLifetimeError ? true : undefined}
              aria-describedby={customLifetimeError ? "custom_lifetime_error" : undefined}
              onChange={(changeEvent) => applyCustomLifetime(changeEvent.target.value, customUnit)}
              className="h-11 w-20 shrink-0 text-center text-[15px]"
            />
            <ToggleGroup
              id="custom_lifetime_unit"
              type="single"
              variant="outline"
              spacing={0}
              value={customUnit.name}
              onValueChange={(pickedUnitName) => {
                const pickedUnit = lifetimeUnits.find((lifetimeUnit) => lifetimeUnit.name === pickedUnitName)
                if (pickedUnit) applyCustomLifetime(customAmountText, pickedUnit)
              }}
              aria-label="Unit"
              className="grid flex-1 grid-cols-3"
            >
              {lifetimeUnits.map((lifetimeUnit, unitIndex) => (
                <ToggleGroupItem
                  key={lifetimeUnit.name}
                  value={lifetimeUnit.name}
                  data-testid={`custom_lifetime_unit_${lifetimeUnit.name}`}
                  className={segmentClassName(unitIndex, lifetimeUnits.length)}
                >
                  {customUnit.name === lifetimeUnit.name ? <SlidingSelectionPill layoutId="custom_lifetime_unit_pill" /> : null}
                  <span className="relative">{lifetimeUnit.label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {customLifetimeError ? <FieldError id="custom_lifetime_error">{customLifetimeError}</FieldError> : null}
        </div>
      ) : null}
      {customLifetimeError ? null : (
        <p id="lifetime_expiry" className="text-[13px] text-muted-foreground">
          Link stops working {formatDayAndTime(currentTime + selectedLifetimeSeconds * 1000)}
        </p>
      )}
    </div>
  )
}
