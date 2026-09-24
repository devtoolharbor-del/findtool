/**
 * ByteCabin client toolkit.
 *
 * Shared browser-side helpers used by every tool. Keeping this common makes
 * 50 tools behave identically for copy, download, upload, errors and limits —
 * and keeps each tool's own script down to wiring plus its actual logic.
 *
 * Rules for this file:
 *  - No dependencies. It ships on every tool page.
 *  - No user content ever leaves the page (see `track`).
 *  - Everything is defensive: a missing element must never throw and break
 *    the rest of the page.
 */

import { LIMITS } from '~/consts';

// ─── DOM ──────────────────────────────────────────────────────────────────

/** Query a single element, typed. Returns null rather than throwing. */
export function q<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T | null {
  return root.querySelector<T>(selector);
}

/** Query all matching elements as a real array. */
export function qa<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

/**
 * Run `fn` once the DOM is parsed. Astro `<script>` tags are deferred modules,
 * so this is usually immediate — but it stays correct if that ever changes.
 */
export function ready(fn: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

/**
 * Scope a tool's script to its own root element.
 *
 * Every tool component renders a wrapper with `data-tool="<slug>"`. Mounting
 * through this helper means a tool can only ever touch its own DOM, and the
 * script is a no-op on pages where the tool is absent.
 */
export function mount(slug: string, setup: (root: HTMLElement) => void): void {
  ready(() => {
    const root = q(`[data-tool="${slug}"]`);
    if (!root) return;
    try {
      setup(root);
    } catch (err) {
      console.error(`[bytecabin] tool "${slug}" failed to start`, err);
      showError(root, 'This tool failed to start. Reloading the page usually fixes it.');
    }
  });
}

/** Add a listener and return a disposer. */
export function on<K extends keyof HTMLElementEventMap>(
  el: HTMLElement | Document | Window | null,
  event: K | string,
  handler: (e: any) => void,
  options?: AddEventListenerOptions,
): () => void {
  if (!el) return () => {};
  el.addEventListener(event as string, handler, options);
  return () => el.removeEventListener(event as string, handler, options);
}

// ─── Text helpers ─────────────────────────────────────────────────────────

/** Escape text for safe interpolation into HTML. Always use before innerHTML. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Human-readable byte size, e.g. 1536 → "1.5 KB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** UTF-8 byte length of a string. */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Group a long string every `size` characters with `sep`. */
export function chunk(s: string, size: number, sep = '\n'): string {
  if (size <= 0) return s;
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += size) parts.push(s.slice(i, i + size));
  return parts.join(sep);
}

export function debounce<F extends (...args: any[]) => void>(fn: F, ms = 150): F {
  let t: ReturnType<typeof setTimeout>;
  return function (this: unknown, ...args: any[]) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  } as F;
}

// ─── Size guards ──────────────────────────────────────────────────────────

export class InputTooLargeError extends Error {
  constructor(actual: number, limit: number) {
    super(
      `Input is ${formatBytes(actual)}, which is over the ${formatBytes(limit)} limit for this tool. ` +
        `Try splitting it into smaller pieces.`,
    );
    this.name = 'InputTooLargeError';
  }
}

/**
 * Refuse oversized input rather than locking the tab. Tools should call this
 * before any expensive synchronous work.
 */
export function guardSize(text: string, limit = LIMITS.maxInputChars): void {
  if (text.length > limit) throw new InputTooLargeError(text.length, limit);
}

// ─── Status / error surfaces ──────────────────────────────────────────────

export type StatusKind = 'error' | 'warn' | 'ok';

/**
 * Render a message into the tool's `[data-status]` slot.
 *
 * Every tool template includes `<div data-status role="status" aria-live="polite">`.
 * Passing `null` clears it. Messages are escaped, never injected as markup.
 */
export function setStatus(
  root: ParentNode,
  message: string | null,
  kind: StatusKind = 'error',
): void {
  const slot = q('[data-status]', root);
  if (!slot) return;
  if (!message) {
    slot.innerHTML = '';
    slot.setAttribute('hidden', '');
    return;
  }
  const cls =
    kind === 'error' ? 'bc-alert-error' : kind === 'warn' ? 'bc-alert-warn' : 'bc-alert-ok';
  slot.removeAttribute('hidden');
  slot.innerHTML = `<div class="bc-alert ${cls}">${escapeHtml(message)}</div>`;
}

export function showError(root: ParentNode, message: string): void {
  setStatus(root, message, 'error');
}
export function clearStatus(root: ParentNode): void {
  setStatus(root, null);
}

/**
 * Turn any thrown value into a message worth showing a user.
 * Never surfaces a bare "undefined" or a stack trace.
 */
export function messageFor(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

// ─── Clipboard ────────────────────────────────────────────────────────────

/**
 * Copy text, with visible confirmation on the button that triggered it.
 * Falls back to a hidden textarea + execCommand on browsers that refuse
 * navigator.clipboard outside a secure context.
 */
export async function copyText(text: string, button?: HTMLElement | null): Promise<boolean> {
  if (!text) {
    if (button) flashButton(button, 'Nothing to copy');
    return false;
  }
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = legacyCopy(text);
  }
  if (button) flashButton(button, ok ? 'Copied' : 'Copy failed');
  if (ok) track('copy_clicked');
  return ok;
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** Briefly replace a button's label, then restore it. */
export function flashButton(button: HTMLElement, label: string, ms = 1400): void {
  const target = q('[data-label]', button) ?? button;
  if (target.dataset.flashing === '1') return;
  const original = target.textContent ?? '';
  target.dataset.flashing = '1';
  target.textContent = label;
  setTimeout(() => {
    target.textContent = original;
    delete target.dataset.flashing;
  }, ms);
}

/**
 * Wire every `[data-copy="<selector>"]` button inside `root`.
 * The selector points at the element whose text (or value) should be copied.
 */
export function wireCopyButtons(root: ParentNode): void {
  for (const btn of qa('[data-copy]', root)) {
    on(btn, 'click', () => {
      const sel = btn.dataset.copy!;
      const src = q(sel, root) as HTMLElement | HTMLTextAreaElement | null;
      if (!src) return;
      const value =
        'value' in src ? (src as HTMLTextAreaElement).value : (src.textContent ?? '');
      void copyText(value, btn);
    });
  }
}

// ─── Download / upload ────────────────────────────────────────────────────

export function downloadText(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next frame so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  track('download_clicked');
}

export class FileTooLargeError extends Error {
  constructor(size: number) {
    super(
      `That file is ${formatBytes(size)}. The limit is ${formatBytes(LIMITS.maxFileBytes)} ` +
        `so the page stays responsive.`,
    );
    this.name = 'FileTooLargeError';
  }
}

/** Read a File as UTF-8 text, enforcing the shared size limit. */
export function readFileText(file: File): Promise<string> {
  if (file.size > LIMITS.maxFileBytes) return Promise.reject(new FileTooLargeError(file.size));
  return file.text();
}

/** Read a File as an ArrayBuffer, enforcing the shared size limit. */
export function readFileBuffer(file: File): Promise<ArrayBuffer> {
  if (file.size > LIMITS.maxFileBytes) return Promise.reject(new FileTooLargeError(file.size));
  return file.arrayBuffer();
}

/**
 * Wire a `[data-upload]` button to a hidden `<input type="file">`, including
 * drag-and-drop onto the given drop zone.
 */
export function wireFileInput(
  root: ParentNode,
  onFile: (file: File) => void,
  opts: { dropZone?: HTMLElement | null } = {},
): void {
  const input = q<HTMLInputElement>('[data-file-input]', root);
  const button = q('[data-upload]', root);
  if (input) {
    on(button, 'click', () => input.click());
    on(input, 'change', () => {
      const file = input.files?.[0];
      if (file) onFile(file);
      input.value = '';
    });
  }
  const zone = opts.dropZone;
  if (zone) {
    on(zone, 'dragover', (e: DragEvent) => {
      e.preventDefault();
      zone.classList.add('ring-2', 'ring-accent');
    });
    on(zone, 'dragleave', () => zone.classList.remove('ring-2', 'ring-accent'));
    on(zone, 'drop', (e: DragEvent) => {
      e.preventDefault();
      zone.classList.remove('ring-2', 'ring-accent');
      const file = e.dataTransfer?.files?.[0];
      if (file) onFile(file);
    });
  }
}

// ─── Analytics ────────────────────────────────────────────────────────────

export type AnalyticsEvent =
  | 'tool_used'
  | 'copy_clicked'
  | 'download_clicked'
  | 'example_loaded'
  | 'search_used'
  | 'related_tool_clicked'
  | 'theme_changed';

/**
 * Record an anonymous interaction.
 *
 * Hard rule: the payload carries the event name, the tool slug from the page
 * URL, and nothing else. User input is never read here, so no amount of
 * misuse at a call site can leak pasted content.
 *
 * With no endpoint configured the call is a no-op beyond a DOM event, which
 * is the state at launch — Cloudflare Web Analytics handles pageviews on its
 * own and needs nothing from this function.
 */
export function track(event: AnalyticsEvent, toolSlug?: string): void {
  const slug = toolSlug ?? currentToolSlug();
  document.dispatchEvent(new CustomEvent('bc:event', { detail: { event, tool: slug } }));

  const endpoint = (window as any).__BC_EVENTS_ENDPOINT as string | undefined;
  if (!endpoint) return;
  try {
    const body = JSON.stringify({ e: event, t: slug });
    navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }));
  } catch {
    /* analytics must never break a tool */
  }
}

function currentToolSlug(): string {
  const m = location.pathname.match(/\/tools\/([a-z0-9-]+)/);
  return m?.[1] ?? location.pathname;
}

/**
 * Fire `tool_used` at most once per page view, the first time a tool produces
 * real output. Counting every keystroke would be noise.
 */
let usedFired = false;
export function markUsed(): void {
  if (usedFired) return;
  usedFired = true;
  track('tool_used');
}

// ─── Small shared behaviours ──────────────────────────────────────────────

/**
 * Wire the standard trio most tools share: copy buttons, a Clear button that
 * empties `[data-clear-target]` fields, and an Example button that fills the
 * primary input from the template's `data-example` attribute.
 */
export function wireStandardActions(
  root: HTMLElement,
  opts: { onChange?: () => void } = {},
): void {
  wireCopyButtons(root);

  on(q('[data-clear]', root), 'click', () => {
    for (const field of qa<HTMLTextAreaElement | HTMLInputElement>(
      '[data-clear-target]',
      root,
    )) {
      field.value = '';
    }
    for (const out of qa('[data-output]', root)) {
      if ('value' in out) (out as HTMLTextAreaElement).value = '';
      else out.textContent = '';
    }
    clearStatus(root);
    opts.onChange?.();
  });

  const exampleBtn = q('[data-example]', root);
  on(exampleBtn, 'click', () => {
    const target = q<HTMLTextAreaElement>('[data-primary-input]', root);
    const sample = exampleBtn?.getAttribute('data-example') ?? '';
    if (target && sample) {
      target.value = sample;
      track('example_loaded');
      opts.onChange?.();
    }
  });
}

/** Swap the contents of two fields — used by every A→B converter. */
export function wireSwap(
  root: HTMLElement,
  aSel = '[data-primary-input]',
  bSel = '[data-output]',
  onDone?: () => void,
): void {
  on(q('[data-swap]', root), 'click', () => {
    const a = q<HTMLTextAreaElement>(aSel, root);
    // The output side may be a <textarea> or a read-only element such as
    // <pre>, so it is read and written through a value/textContent shim.
    const b = q<HTMLElement>(bSel, root);
    if (!a || !b) return;

    const isField = b instanceof HTMLTextAreaElement || b instanceof HTMLInputElement;
    const tmp = a.value;
    a.value = isField ? b.value : (b.textContent ?? '');
    if (isField) b.value = tmp;
    onDone?.();
  });
}

/** Keep a textarea's height in step with its content, up to a maximum. */
export function autoGrow(el: HTMLTextAreaElement, maxPx = 640): void {
  const resize = () => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, maxPx)}px`;
  };
  on(el, 'input', resize);
  resize();
}
