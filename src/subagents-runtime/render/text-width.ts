// Independently adapted from pi-subagents-j0k3r (MIT); see THIRD_PARTY_NOTICES.md.
const ESCAPE = /\u001b\][^\u001b\u0007]*(?:\u001b\\|\u0007)|\u001b\[[0-?]*[ -/]*[@-~]/g;
const TOKEN = /\u001b\][^\u001b\u0007]*(?:\u001b\\|\u0007)|\u001b\[[0-?]*[ -/]*[@-~]|[\s\S]/gu;
const wide = /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f000}-\u{1faff}]/u;
export const stripAnsi = (text: string) => text.replace(ESCAPE, "");
export function characterWidth(value: string) { return /^\u001b/u.test(value) || /\p{Mark}|\p{Cc}|\p{Cf}/u.test(value) ? 0 : wide.test(value) ? 2 : 1; }
export function visibleWidth(text: string) { return [...stripAnsi(text)].reduce((total, char) => total + characterWidth(char), 0); }
export function wrapLineToWidth(line: string, width: number): string[] {
  const max = Math.max(1, width); if (!line || visibleWidth(line) <= max) return [line];
  const output: string[] = []; let current = ""; let used = 0;
  for (const token of line.match(TOKEN) ?? []) { const size = characterWidth(token); if (used + size > max && current) { output.push(current); current = ""; used = 0; } current += token; used += size; }
  if (current || !output.length) output.push(current); return output;
}
