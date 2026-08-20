import { SubagentsHistoryPanel, type HistoryPanelOptions } from "./subagents-history-panel.js";
import { createPiThreadEntryRenderer } from "./thread-components.js";

const MOUSE_TRACKING_ON = "\u001b[?1000h\u001b[?1006h";
const MOUSE_TRACKING_OFF = "\u001b[?1006l\u001b[?1000l";

/** Full-screen execution-flow overlay. Pi's custom overlay owns input while mounted. */
export async function openHistoryOverlay(ctx: any, options: Omit<HistoryPanelOptions, "close" | "requestRender" | "theme" | "renderEntry" | "maxLines">) {
  let requestRender: (() => void) | undefined;
  let refresh: ReturnType<typeof setInterval> | undefined;
  let disableMouse: (() => void) | undefined;
  const cleanup = () => {
    if (refresh) clearInterval(refresh);
    refresh = undefined;
    requestRender = undefined;
    disableMouse?.();
    disableMouse = undefined;
  };
  try {
    return await Promise.resolve(ctx.ui.custom((tui: any, theme: any, _keys: any, done: () => void) => {
      const write = tui?.terminal?.write?.bind(tui.terminal);
      let closed = false;
      const close = () => { if (closed) return; closed = true; cleanup(); done(); };
      if (typeof write === "function") {
        write(MOUSE_TRACKING_ON);
        disableMouse = () => write(MOUSE_TRACKING_OFF);
      }
      requestRender = () => tui.requestRender?.();
      refresh = setInterval(() => requestRender?.(), 500);
      const panel = new SubagentsHistoryPanel({
        ...options,
        close,
        theme,
        requestRender,
        maxLines: () => Math.max(12, (process.stdout.rows || 42) - 2),
        renderEntry: createPiThreadEntryRenderer(tui, typeof ctx.cwd === "string" ? ctx.cwd : ""),
      });
      // Pi calls dispose when an overlay is replaced; keep terminal mouse mode clean on both paths.
      return { render: (width: number) => panel.render(width), handleInput: (data: string) => panel.handleInput(data), invalidate: () => panel.invalidate(), dispose: cleanup };
    }, { overlay: true, overlayOptions: { anchor: "top-left", width: "100%", maxHeight: "100%", margin: 0 } }));
  } finally { cleanup(); }
}

export { MOUSE_TRACKING_OFF, MOUSE_TRACKING_ON };
