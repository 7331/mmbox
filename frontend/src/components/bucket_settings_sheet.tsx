// "Use my own bucket": the connection form, the test (direct first; when the bucket blocks the browser, the relay),
// and the CORS help. A Drawer on a phone, a Dialog from 768 px. Saving keeps the tested settings, keys included, in
// this browser only (lib/bucket_connection.ts).
import { CircleCheck, Copy } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { ResponsiveSheet } from "@/components/responsive_sheet"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ApplicationButton } from "@/components/application_button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  BucketBlockedError,
  checkBucketThroughRelay,
  createCorsCommandText,
  createCorsPolicyText,
  normalizeBucketSettings,
  testDirectBucketAccess,
  type BucketSettings,
  type BucketSettingsFormValues,
} from "@/lib/bucket_connection"
import { tryCopyTextToClipboard } from "@/lib/clipboard_and_sharing"
import { cn } from "@/lib/utils"

type BucketFieldName = keyof BucketSettingsFormValues

interface BucketFieldDescription {
  fieldName: BucketFieldName
  label: string
  inputType: "text" | "url" | "password"
  placeholder?: string
  isRequired: boolean
}

const connectionFields: BucketFieldDescription[] = [
  { fieldName: "endpoint", label: "Endpoint", inputType: "url", placeholder: "e.g. https://….r2.cloudflarestorage.com", isRequired: true },
  { fieldName: "bucket", label: "Bucket", inputType: "text", placeholder: "e.g. photos", isRequired: true },
  { fieldName: "region", label: "Region", inputType: "text", placeholder: "auto", isRequired: false },
  { fieldName: "accessKeyId", label: "Access key", inputType: "text", isRequired: true },
  { fieldName: "secretAccessKey", label: "Secret", inputType: "password", isRequired: true },
]

const publishingFields: BucketFieldDescription[] = [
  { fieldName: "publicBase", label: "Public URL", inputType: "url", placeholder: "e.g. https://files.example.com", isRequired: true },
  { fieldName: "prefix", label: "Folder", inputType: "text", placeholder: "optional, e.g. media", isRequired: false },
]

const emptyFormValues: BucketSettingsFormValues = {
  endpoint: "",
  bucket: "",
  region: "",
  accessKeyId: "",
  secretAccessKey: "",
  publicBase: "",
  prefix: "",
}

// snake_case ids for the browser checks: `bucket_access_key_id_input`.
const buildFieldInputId = (fieldName: BucketFieldName): string => `bucket_${fieldName.replace(/[A-Z]/g, (capital) => `_${capital.toLowerCase()}`)}_input`

function findFieldErrors(formValues: BucketSettingsFormValues): Partial<Record<BucketFieldName, string>> {
  const fieldErrors: Partial<Record<BucketFieldName, string>> = {}
  for (const fieldDescription of [...connectionFields, ...publishingFields]) {
    const fieldValue = formValues[fieldDescription.fieldName].trim()
    if (fieldDescription.isRequired && !fieldValue) fieldErrors[fieldDescription.fieldName] = `Fill in the ${fieldDescription.label.toLowerCase()}.`
    else if (fieldDescription.inputType === "url" && fieldValue && !/^https?:\/\/[^\s/]+/.test(fieldValue)) {
      fieldErrors[fieldDescription.fieldName] = "A full address starting with https://"
    }
  }
  return fieldErrors
}

interface BucketTestMessage {
  text: string
  tone: "plain" | "good" | "error"
}

export function BucketSettingsSheet({
  isOpen,
  onOpenChange,
  currentBucketSettings,
  onApplyBucketSettings,
}: {
  isOpen: boolean
  onOpenChange(nextIsOpen: boolean): void
  currentBucketSettings: BucketSettings | null
  // Saves the tested settings (or null: back to temporary links) and repaints the page.
  onApplyBucketSettings(nextBucketSettings: BucketSettings | null): void
}) {
  return (
    <ResponsiveSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Use my own bucket"
      description="Any S3-compatible bucket: R2, Backblaze, AWS, or RustFS / MinIO behind a tunnel. Uploads never expire and you can browse what's there. Keys stay in this browser."
    >
      {/* Remounted per opening, so the form starts from the saved settings each time. */}
      {isOpen ? (
        <BucketSettingsForm
          currentBucketSettings={currentBucketSettings}
          onApplyBucketSettings={(nextBucketSettings) => {
            onApplyBucketSettings(nextBucketSettings)
            onOpenChange(false)
          }}
        />
      ) : null}
    </ResponsiveSheet>
  )
}

function BucketSettingsForm({
  currentBucketSettings,
  onApplyBucketSettings,
}: {
  currentBucketSettings: BucketSettings | null
  onApplyBucketSettings(nextBucketSettings: BucketSettings | null): void
}) {
  const [formValues, setFormValues] = useState<BucketSettingsFormValues>(() =>
    currentBucketSettings
      ? {
          endpoint: currentBucketSettings.endpoint,
          bucket: currentBucketSettings.bucket,
          region: currentBucketSettings.region,
          accessKeyId: currentBucketSettings.accessKeyId,
          secretAccessKey: currentBucketSettings.secretAccessKey,
          publicBase: currentBucketSettings.publicBase,
          prefix: currentBucketSettings.prefix,
        }
      : emptyFormValues,
  )
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BucketFieldName, string>>>({})
  const [testMessage, setTestMessage] = useState<BucketTestMessage | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const pageOrigin = location.origin
  const corsPolicyText = createCorsPolicyText(pageOrigin)
  const corsCommandText = createCorsCommandText(normalizeBucketSettings(formValues), pageOrigin)

  // Direct first; when the bucket blocks the browser (no CORS), the relay. Returns the working mode.
  async function findWorkingBucketMode(testedSettings: BucketSettings): Promise<BucketSettings["mode"] | null> {
    setTestMessage({ text: "Writing and removing a test object…", tone: "plain" })
    try {
      await testDirectBucketAccess(testedSettings)
      setTestMessage({ text: "Works directly: any size, video included.", tone: "good" })
      return "direct"
    } catch (directError) {
      if (!(directError instanceof BucketBlockedError)) {
        setTestMessage({ text: (directError as Error).message, tone: "error" })
        return null
      }
    }
    try {
      setTestMessage({ text: "No CORS on the bucket; trying the mmbox relay…", tone: "plain" })
      await checkBucketThroughRelay(testedSettings)
      setTestMessage({ text: "Works through the relay: images up to 25 MB. Add CORS for video.", tone: "good" })
      return "relay"
    } catch (relayError) {
      setTestMessage({ text: `Neither direct nor relayed access worked: ${(relayError as Error).message}`, tone: "error" })
      return null
    }
  }

  // Checks the fields; on a wrong one, scrolls to it and says why under it.
  function validateFormValues(): BucketSettings | null {
    const nextFieldErrors = findFieldErrors(formValues)
    setFieldErrors(nextFieldErrors)
    const firstWrongFieldName = Object.keys(nextFieldErrors)[0] as BucketFieldName | undefined
    if (firstWrongFieldName) {
      const firstWrongInput = document.getElementById(buildFieldInputId(firstWrongFieldName))
      firstWrongInput?.scrollIntoView({ block: "center", behavior: "smooth" })
      firstWrongInput?.focus({ preventScroll: true })
      return null
    }
    return normalizeBucketSettings(formValues)
  }

  async function runBucketTest(): Promise<BucketSettings["mode"] | null> {
    const testedSettings = validateFormValues()
    if (!testedSettings) return null
    setIsTesting(true)
    try {
      return await findWorkingBucketMode(testedSettings)
    } finally {
      setIsTesting(false)
    }
  }

  async function testAndSaveBucket(submitEvent: FormEvent) {
    submitEvent.preventDefault()
    const workingMode = await runBucketTest()
    if (!workingMode) return
    const savedSettings = { ...normalizeBucketSettings(formValues), mode: workingMode }
    onApplyBucketSettings(savedSettings)
    toast.success(workingMode === "relay" ? `Relaying to ${savedSettings.bucket}` : `Uploading to ${savedSettings.bucket}`)
  }

  async function copyHelpText(helpText: string, helpName: string) {
    const helpWasCopied = await tryCopyTextToClipboard(helpText)
    if (helpWasCopied) toast(`${helpName} copied`)
    else toast.error("Could not copy")
  }

  function renderBucketField(fieldDescription: BucketFieldDescription) {
    const inputId = buildFieldInputId(fieldDescription.fieldName)
    const errorText = fieldErrors[fieldDescription.fieldName]
    return (
      <Field key={fieldDescription.fieldName} data-invalid={Boolean(errorText)}>
        <FieldLabel htmlFor={inputId}>{fieldDescription.label}</FieldLabel>
        <Input
          id={inputId}
          name={fieldDescription.fieldName}
          type={fieldDescription.inputType}
          inputMode={fieldDescription.inputType === "url" ? "url" : undefined}
          placeholder={fieldDescription.placeholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={Boolean(errorText)}
          aria-describedby={errorText ? `${inputId}_error` : undefined}
          value={formValues[fieldDescription.fieldName]}
          onChange={(changeEvent) => {
            const nextValue = changeEvent.target.value
            setFormValues((currentValues) => ({ ...currentValues, [fieldDescription.fieldName]: nextValue }))
            setFieldErrors((currentErrors) => ({ ...currentErrors, [fieldDescription.fieldName]: undefined }))
          }}
          className="h-12 rounded-xl px-3.5 text-base"
        />
        {errorText ? <FieldError id={`${inputId}_error`}>{errorText}</FieldError> : null}
      </Field>
    )
  }

  return (
    <form id="bucket_settings_form" onSubmit={testAndSaveBucket} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">{connectionFields.map(renderBucketField)}</div>
      <div className="flex flex-col gap-4">{publishingFields.map(renderBucketField)}</div>
      <Accordion type="single" collapsible className="rounded-2xl border px-4">
        {/* The content's clip box reaches 12 px past the text, so a 44 px hit area or a focus ring at its edge isn't cut
            off while the content stays where it was (UX-045, 2026-10-12). AccordionContent's className styles its inner
            div, so the clip box (its direct child slot) is styled from here. */}
        <AccordionItem value="cors_help" className="[&>[data-slot=accordion-content]]:-mx-3 [&>[data-slot=accordion-content]]:px-3">
          <AccordionTrigger id="cors_help_trigger" className="min-h-11 items-center text-[15px]">
            CORS (optional)
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Without it, this server relays for you: images only, up to 25 MB, stripped on the server, keys sent per request
              and never stored. With it, files go straight from this browser to your bucket, any size, video included. Paste
              the policy into the bucket's CORS settings (R2: bucket, Settings, CORS policy), or run the command once. Use a
              key scoped to this bucket with object read and write only.
            </p>
            <pre id="cors_policy_text" className="rounded-xl bg-muted p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
              {corsPolicyText}
            </pre>
            <pre id="cors_command_text" className="rounded-xl bg-muted p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
              {corsCommandText}
            </pre>
            <div className="grid grid-cols-2 gap-2">
              <ApplicationButton id="copy_cors_policy_button" type="button" variant="outline" size="touch" onClick={() => void copyHelpText(corsPolicyText, "Policy")}>
                <Copy />
                Copy policy
              </ApplicationButton>
              <ApplicationButton id="copy_cors_command_button" type="button" variant="outline" size="touch" onClick={() => void copyHelpText(corsCommandText, "Command")}>
                <Copy />
                Copy command
              </ApplicationButton>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <p
        id="bucket_test_message"
        role="status"
        aria-live="polite"
        className={cn(
          "flex min-h-5 items-start gap-1.5 text-sm",
          testMessage?.tone === "good" && "text-success",
          testMessage?.tone === "error" && "text-destructive",
          testMessage?.tone === "plain" && "text-muted-foreground",
        )}
      >
        {testMessage?.tone === "good" ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : null}
        {testMessage?.text}
      </p>
      <div className="flex flex-col gap-2 pb-1">
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <ApplicationButton id="test_bucket_button" type="button" variant="outline" size="xl" disabled={isTesting} onClick={() => void runBucketTest()}>
            Test
          </ApplicationButton>
          <ApplicationButton id="save_bucket_button" type="submit" size="xl" disabled={isTesting}>
            {isTesting ? <Spinner /> : <CircleCheck />}
            Test and save
          </ApplicationButton>
        </div>
        {currentBucketSettings ? (
          <ApplicationButton
            id="forget_bucket_button"
            type="button"
            variant="ghost"
            size="touch"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              onApplyBucketSettings(null)
              toast("Back to temporary links")
            }}
          >
            Stop using this bucket
          </ApplicationButton>
        ) : null}
      </div>
    </form>
  )
}
