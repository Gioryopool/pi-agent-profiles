// Independently adapted from pi-subagents-j0k3r (MIT); see THIRD_PARTY_NOTICES.md.
import { visibleWidth, wrapLineToWidth } from "./text-width.js";
export function textComponent(text: string) { return { invalidate() {}, render(width: number) { return text.split("\n").map((line) => visibleWidth(line) <= width ? line : `${wrapLineToWidth(line, Math.max(1, width - 1))[0] ?? ""}…\u001b[0m`); } }; }
export function wrappedTextComponent(text: string) { return { invalidate() {}, render(width: number) { return text.split("\n").flatMap((line) => wrapLineToWidth(line, width)); } }; }
