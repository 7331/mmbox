import { EDITOR_MAXIMUM_EDGE } from "./types";
import type { PendingUpload } from "./types";
import { randomTransportName } from "./upload";
import type { AnnotationEditor, AnnotationEditorRenderEventData } from "@markerjs/markerjs-ui";

type MarkerUiModule = typeof import("@markerjs/markerjs-ui");

export interface EditorHooks {
  getPending(): PendingUpload | null;
  showSelected(message?: string, allowEdit?: boolean, buttonText?: string): void;
  say(message: string, tone?: string): void;
}

const editorLayer = document.getElementById("editorLayer") as HTMLElement;
const markerHost = document.getElementById("markerHost") as HTMLElement;
const doneEditor = document.getElementById("doneEditor") as HTMLButtonElement;

let editor: AnnotationEditor | null = null;
let editorPromise: Promise<MarkerUiModule> | null = null;

function loadEditor(): Promise<MarkerUiModule> {
  editorPromise ??= import("@markerjs/markerjs-ui").catch((failure: unknown) => {
    editorPromise = null;
    throw failure;
  });
  return editorPromise;
}

function customizeEditor(annotationEditor: AnnotationEditor): void {
  const root = annotationEditor.shadowRoot;
  const save = root?.querySelector('[aria-label="OK"]');
  const close = root?.querySelector('[aria-label="Close"]');
  if (save) {
    save.setAttribute("aria-label", "Done editing");
    (save as HTMLElement).title = "Done editing";
  }
  if (close) {
    close.setAttribute("aria-label", "Cancel editing");
    (close as HTMLElement).title = "Cancel editing";
  }
  const styles = document.createElement("style");
  styles.textContent = `
    [aria-label="Done editing"], [aria-label="Cancel editing"], [aria-label="Notes"] { display: none !important; }
    @media (max-width: 699px) {
      #toolbarContainer > div, #toolboxContainer > div { min-height: 52px; padding: 4px 6px !important; }
      .btn, [role="button"] { min-width: 44px !important; min-height: 44px !important; }
      .btn svg, [role="button"] svg { width: 23px; height: 23px; }
      #markerAreaContainer { touch-action: none; }
    }
  `;
  root?.append(styles);
}

export async function openMarkerEditor(hooks: EditorHooks): Promise<void> {
  try {
    const { AnnotationEditor: EditorClass } = await loadEditor();
    const pending = hooks.getPending();
    if (!pending) return;
    const target = new Image();
    target.src = pending.previewUrl;
    await target.decode();
    const scale = Math.min(1, EDITOR_MAXIMUM_EDGE / Math.max(target.naturalWidth, target.naturalHeight));
    editor = new EditorClass();
    editor.targetImage = target;
    editor.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    editor.settings.autoZoomIn = true;
    editor.settings.autoZoomOut = true;
    editor.settings.renderOnSave = false;
    pending.finishing = false;
    pending.renderTarget = target;
    pending.renderSettings = {
      width: Math.max(1, Math.round(target.naturalWidth * scale)),
      height: Math.max(1, Math.round(target.naturalHeight * scale)),
      imageType: pending.contentType === "image/jpeg" ? "image/jpeg" : "image/png",
      imageQuality: 0.92,
    };
    editor.addEventListener("editorclose", () => closeMarkerEditor(hooks));
    editor.addEventListener("editorsave", (event) => {
      void finishMarkerEditor(hooks, event as CustomEvent<AnnotationEditorRenderEventData>);
    });
    markerHost.replaceChildren(editor);
    editorLayer.hidden = false;
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => customizeEditor(editor as AnnotationEditor));
  } catch (failure) {
    console.warn("mmbox: marker.js unavailable", failure);
    hooks.showSelected("Editor unavailable. The original is unchanged.", true);
  }
}

function dismissEditor(): void {
  editorLayer.hidden = true;
  markerHost.replaceChildren();
  editor = null;
  document.documentElement.style.overflow = "";
  doneEditor.disabled = false;
}

export function closeMarkerEditor(hooks: EditorHooks): void {
  dismissEditor();
  const pending = hooks.getPending();
  if (pending) hooks.showSelected("", pending.canEdit);
}

async function finishMarkerEditor(
  hooks: EditorHooks,
  event: CustomEvent<AnnotationEditorRenderEventData>,
): Promise<void> {
  const pending = hooks.getPending();
  if (!pending || pending.finishing) return;
  pending.finishing = true;
  doneEditor.disabled = true;
  try {
    const markers = event.detail.state?.markers || [];
    if (markers.length) {
      const { Renderer } = await import("@markerjs/markerjs3");
      const renderer = new Renderer();
      renderer.targetImage = pending.renderTarget;
      renderer.naturalSize = false;
      Object.assign(renderer, pending.renderSettings);
      const dataUrl = await renderer.rasterize(event.detail.state);
      if (!dataUrl) throw new Error("Marker.js did not render the edited image");
      const rendered = await fetch(dataUrl).then((response) => response.blob());
      const oldPreview = pending.previewUrl;
      pending.uploadFile = rendered;
      pending.contentType = rendered.type || "image/png";
      pending.bytes = rendered.size;
      pending.previewUrl = URL.createObjectURL(rendered);
      pending.transportName = randomTransportName(pending.contentType);
      URL.revokeObjectURL(oldPreview);
    }
    dismissEditor();
    pending.finishing = false;
    hooks.showSelected("", true);
  } catch (failure) {
    console.warn("mmbox: could not render markup", failure);
    pending.finishing = false;
    doneEditor.disabled = false;
    hooks.say("Could not render the markup", "bad");
  }
}

/** The Done bar button forwards to the editor's own (hidden) OK button. */
export function clickEditorDone(): void {
  editor?.shadowRoot
    ?.querySelector<HTMLElement>('[aria-label="Done editing"], [aria-label="OK"]')
    ?.click();
}
