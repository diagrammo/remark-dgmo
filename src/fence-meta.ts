import type { Mode, Theme } from './options.js';

/**
 * Per-block options that can be set via the fence info string, e.g.
 *
 *     ```dgmo showcase palette=catppuccin theme=light title="Login flow"
 *
 * Tokens are space-separated. Boolean tokens are bare words (`showcase`,
 * `diagram`, `noSource`). Key=value pairs use `=`; values may be quoted with
 * double quotes to include spaces.
 */
export interface BlockOptions {
  mode?: Mode;
  palette?: string;
  theme?: Theme;
  colorMode?: 'auto' | 'light' | 'dark';
  showSource?: boolean;
  showCopy?: boolean;
  showOpenInEditor?: boolean;
  title?: string;
}

const BARE_FLAGS: Record<string, Partial<BlockOptions>> = {
  diagram: { mode: 'diagram' },
  showcase: { mode: 'showcase' },
  noSource: { showSource: false },
  source: { showSource: true },
  noCopy: { showCopy: false },
  copy: { showCopy: true },
  noOpenInEditor: { showOpenInEditor: false },
  openInEditor: { showOpenInEditor: true },
};

const VALID_THEMES = new Set<Theme>(['light', 'dark', 'transparent']);
const VALID_COLOR_MODES = new Set<'auto' | 'light' | 'dark'>([
  'auto',
  'light',
  'dark',
]);

/**
 * Parse the meta string that follows ```dgmo on the fence line.
 * Robust to: empty, missing, malformed input.
 */
export function parseFenceMeta(meta: string | null | undefined): BlockOptions {
  if (!meta) return {};
  const out: BlockOptions = {};
  const tokens = tokenize(meta);
  for (const tok of tokens) {
    if (BARE_FLAGS[tok]) {
      Object.assign(out, BARE_FLAGS[tok]);
      continue;
    }
    const eq = tok.indexOf('=');
    if (eq < 0) continue;
    const key = tok.slice(0, eq).trim();
    const rawVal = tok.slice(eq + 1).trim();
    const val = unquote(rawVal);
    switch (key) {
      case 'palette':
        if (val) out.palette = val;
        break;
      case 'theme':
        if (VALID_THEMES.has(val as Theme)) out.theme = val as Theme;
        break;
      case 'colorMode':
        if (VALID_COLOR_MODES.has(val as 'auto' | 'light' | 'dark')) {
          out.colorMode = val as 'auto' | 'light' | 'dark';
        }
        break;
      case 'mode':
        if (val === 'diagram' || val === 'showcase') out.mode = val;
        break;
      case 'showSource':
        out.showSource = parseBool(val);
        break;
      case 'showCopy':
        out.showCopy = parseBool(val);
        break;
      case 'showOpenInEditor':
        out.showOpenInEditor = parseBool(val);
        break;
      case 'title':
        if (val) out.title = val;
        break;
    }
  }
  return out;
}

function parseBool(s: string): boolean {
  return s === 'true' || s === '1' || s === 'yes';
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Split on whitespace, respecting double-quoted segments so a value like
 * `title="Login flow"` survives intact.
 */
function tokenize(input: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      buf += ch;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}
