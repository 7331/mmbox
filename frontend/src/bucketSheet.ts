/** "Use my own bucket" sheet: the connection form, the direct/relay test, and the CORS help. */
import {
  BucketBlockedError,
  checkBucketRelay,
  corsCommandFor,
  corsPolicyFor,
  normalizeBucketSettings,
  testBucket,
} from "./bucket";
import type { BucketSettings } from "./bucket";
import { iconMarkup } from "./icons";
import { closeSheetOnBackdropTap } from "./sheets";

export interface BucketSheetHooks {
  say(message: string, tone?: string): void;
  copyText(text: string): Promise<boolean>;
  currentSettings(): BucketSettings | null;
  /** Saves the tested settings (or null to stop using the bucket) and repaints the page. */
  applySettings(settings: BucketSettings | null): void;
}

const bucketDialog = document.getElementById("bucketDialog") as HTMLDialogElement;
const bucketForm = document.getElementById("bucketForm") as HTMLFormElement;
const bucketMessage = document.getElementById("bucketMessage") as HTMLElement;
const corsCommand = document.getElementById("corsCommand") as HTMLElement;
const testButton = document.getElementById("testBucket") as HTMLButtonElement;
const saveButton = document.getElementById("saveBucket") as HTMLButtonElement;
const forgetButton = document.getElementById("forgetBucket") as HTMLButtonElement;

let hooks: BucketSheetHooks;

function bucketFormSettings(): BucketSettings {
  const data = new FormData(bucketForm);
  const field = (name: string): string => String(data.get(name) ?? "");
  return normalizeBucketSettings({
    endpoint: field("endpoint"),
    bucket: field("bucket"),
    region: field("region"),
    accessKeyId: field("accessKeyId"),
    secretAccessKey: field("secretAccessKey"),
    publicBase: field("publicBase"),
    prefix: field("prefix"),
  });
}

function paintCorsCommand(): void {
  corsCommand.textContent = corsCommandFor(bucketFormSettings(), location.origin);
}

/** "good" leads with a check mark, "bad" is red, anything else is plain progress text. */
function tellBucket(message: string, tone: "" | "good" | "bad" = ""): void {
  bucketMessage.dataset.tone = tone;
  bucketMessage.textContent = message;
  if (tone === "good") bucketMessage.insertAdjacentHTML("afterbegin", iconMarkup("circleCheck", 18));
}

/** Direct first; when the bucket blocks the browser (no CORS), try the relay. Returns the working mode. */
async function findWorkingMode(settings: BucketSettings): Promise<BucketSettings["mode"] | null> {
  tellBucket("Writing and removing a test object…");
  try {
    await testBucket(settings);
    tellBucket("Works directly: any size, video included.", "good");
    return "direct";
  } catch (failure) {
    if (!(failure instanceof BucketBlockedError)) {
      tellBucket((failure as Error).message, "bad");
      return null;
    }
  }
  try {
    tellBucket("No CORS on the bucket; trying the mmbox relay…");
    await checkBucketRelay(settings);
    tellBucket("Works through the relay: images up to 25 MB. Add CORS for video.", "good");
    return "relay";
  } catch (failure) {
    tellBucket(`Neither direct nor relayed access worked: ${(failure as Error).message}`, "bad");
    return null;
  }
}

async function runBucketTest(settings: BucketSettings): Promise<BucketSettings["mode"] | null> {
  testButton.disabled = true;
  saveButton.disabled = true;
  try {
    return await findWorkingMode(settings);
  } finally {
    testButton.disabled = false;
    saveButton.disabled = false;
  }
}

export function openBucketSheet(): void {
  const current = hooks.currentSettings();
  (Object.keys(bucketFormSettings()) as (keyof BucketSettings)[]).forEach((name) => {
    const input = bucketForm.elements.namedItem(name) as HTMLInputElement | null;
    if (input) input.value = current?.[name] ?? "";
  });
  forgetButton.hidden = !current;
  tellBucket("");
  paintCorsCommand();
  bucketDialog.showModal();
}

async function copyAndSay(text: string, what: string): Promise<void> {
  const copied = await hooks.copyText(text);
  hooks.say(copied ? `${what} copied` : "Could not copy", copied ? "" : "bad");
}

export function initBucketSheet(bucketSheetHooks: BucketSheetHooks): void {
  hooks = bucketSheetHooks;
  document.getElementById("corsPolicy")!.textContent = corsPolicyFor(location.origin);
  closeSheetOnBackdropTap(bucketDialog);
  bucketForm.addEventListener("input", paintCorsCommand);
  document.getElementById("closeBucketSheet")!.addEventListener("click", () => bucketDialog.close());
  document.getElementById("copyCorsPolicy")!.addEventListener("click", () => {
    void copyAndSay(corsPolicyFor(location.origin), "Policy");
  });
  document.getElementById("copyCorsCommand")!.addEventListener("click", () => {
    void copyAndSay(corsCommandFor(bucketFormSettings(), location.origin), "Command");
  });
  testButton.addEventListener("click", () => {
    if (bucketForm.reportValidity()) void runBucketTest(bucketFormSettings());
  });
  bucketForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const settings = bucketFormSettings();
    void runBucketTest(settings).then((mode) => {
      if (!mode) return;
      settings.mode = mode;
      hooks.applySettings(settings);
      bucketDialog.close();
      hooks.say(mode === "relay" ? `Relaying to ${settings.bucket}` : `Uploading to ${settings.bucket}`);
    });
  });
  forgetButton.addEventListener("click", () => {
    hooks.applySettings(null);
    bucketDialog.close();
    hooks.say("Back to temporary links");
  });
}
