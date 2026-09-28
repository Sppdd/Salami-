// Pure helpers for handling model output. No env/network imports so they are unit-testable.

/** Remove reasoning traces (<think>…</think>) that Nemotron reasoning models may emit inline. */
export function stripThinking(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // An unterminated <think> block means everything after it is reasoning.
  const open = out.search(/<think>/i);
  if (open !== -1) out = out.slice(0, open);
  // Some templates emit only the closing tag: drop everything before it.
  const close = out.search(/<\/think>/i);
  if (close !== -1) out = out.slice(close + '</think>'.length);
  return out.trim();
}

/**
 * Extract the first balanced JSON object from model output. Tolerates markdown
 * fences, leading prose and trailing commentary. Returns null when nothing parses.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  const text = stripThinking(raw);
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            return JSON.parse(candidate) as T;
          } catch {
            try {
              // Common model slip: trailing commas.
              return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')) as T;
            } catch {
              break;
            }
          }
        }
      }
    }
  }
  return null;
}

/** Make text safe and pleasant for a TTS <Say>: no markdown, no emoji, bounded length. */
export function speakable(text: string, max = 600): string {
  const cleaned = text
    .replace(/[*_`#>]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return lastStop > max / 2 ? cut.slice(0, lastStop + 1) : cut;
}

/** Normalize a phone number to E.164. Assumes North America for bare 10-digit numbers. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
