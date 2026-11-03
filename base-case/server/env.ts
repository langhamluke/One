/**
 * Tiny .env loader (no dotenv dependency). Values already present in process.env win.
 * Supports `KEY=value`, `export KEY=value`, `# comments`, and single/double-quoted values.
 */
import fs from 'node:fs';
import path from 'node:path';

export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      const end = value.indexOf(quote, 1);
      value = end > 0 ? value.slice(1, end) : value.slice(1);
    } else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
      if (value.startsWith('#')) value = '';
    }
    out[m[1]] = value;
  }
  return out;
}

/** Load `.env` from the project root (cwd) into process.env without overriding existing variables. */
export function loadDotEnv(file = path.resolve(process.cwd(), '.env')): void {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const [k, v] of Object.entries(parseDotEnv(text))) {
    if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
  }
}
