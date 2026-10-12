# frontend

mmbox's Vite SPA, on pay.7331.org's stack and design (owner, 2026-10-12): React, TypeScript, shadcn/ui (radix-nova,
neutral, lucide) on Tailwind v4, Motion, Geist bundled. Pay's files (`/root/pay-7331/frontend`) are copied and adapted
here, never imported; when pay's design moves, copy the change. Read the root AGENTS.md first.

## Layout

```
src/main.tsx                    mounts media_box_application.tsx with the Toaster
src/media_box_application.tsx   the app: home or the upload flow, plus the overlays
src/index.css                   pay's tokens (shadcn, success/warning, dark via prefers-color-scheme),
                                `touch-target-hit-area`, reduced motion
src/screens/                    home_screen (drop zone, device shelf, bucket grid), upload_flow_screen (pick,
                                destination, lifetime, upload, result link)
src/components/                 pay's page_column, site_top_bar, responsive_sheet (Drawer on a phone, Dialog from
                                768 px), tap_to_copy_button and motion pieces, plus mmbox's brand_mark (the spiral
                                box), bucket_settings_sheet, bucket_object_grid, device_upload_shelf,
                                media_viewer_overlay, marker_image_editor_overlay (lazy), deletion_confirmation_provider;
                                ui/ is shadcn
src/hooks/                      use_upload_flow, use_upload_shelf, use_bucket_listing, use_browser_back_closes_layer, ...
src/lib/                        bucket_connection (aws4fetch signing, direct first, relay fallback), server_upload,
                                image_preparation, upload_history_database (IndexedDB shelf), browser_history_layers,
                                clipboard_and_sharing, display_formatting
public/                         manifest.webmanifest, service-worker.js (share target only, caches nothing), icons/
```

## Rules

- Mobile first: check 360, 390, 430 px and 1440 desktop, light and dark; no sideways scroll; touch targets 44 px.
- The viewer, the bucket sheet and the editor load on first use (lazy chunks).
- localStorage keys `mmbox.bucket` and `mmbox.lifetime` keep their names: changing one forgets every visitor's bucket.
- Never `fetch()` a `data:` URL: the CSP's `connect-src` blocks it (the editor lost every save that way until
  2026-10-12).
- Element ids browser checks rely on: `#file_picker_input`, `#upload_selected_button`, `#result_link_text`,
  `#bucket_*_input`, `#confirm_deletion_button`, `[data-viewer-action]`; keep them when changing markup.
