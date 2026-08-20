import { Key, matchesKey } from "@earendil-works/pi-tui";
export const panelKey = (data: string, key: string) => matchesKey(data, key as any);
export const closeKey = (data: string) => matchesKey(data, Key.escape) || matchesKey(data, "q") || matchesKey(data, Key.shift("q"));
export const pageDelta = (data: string) => matchesKey(data, Key.pageUp) ? -8 : matchesKey(data, Key.pageDown) ? 8 : 0;
/** SGR, urxvt, and X10 wheel reports. Mouse mode is enabled by the overlay while it owns input. */
export const mouseWheelDelta = (data: string) => {
  const sgr = /^\u001b\[<(\d+);\d+;\d+[Mm]$/.exec(data);
  const urxvt = /^\u001b\[(\d+);\d+;\d+[Mm]$/.exec(data);
  const x10 = data.startsWith("\u001b[M") && data.length >= 6 ? String(data.charCodeAt(3) - 32) : undefined;
  const button = Number(sgr?.[1] ?? urxvt?.[1] ?? x10);
  if (!Number.isFinite(button) || (button & 64) === 0) return 0;
  return (button & 1) === 0 ? -3 : 3;
};
