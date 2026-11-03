import { labelForPath } from './labels';

export interface DiffRow {
  path: string;
  label: string;
  before: unknown;
  after: unknown;
  kind: 'added' | 'removed' | 'changed';
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function flatten(x: unknown, prefix: string, out: Map<string, unknown>): void {
  if (Array.isArray(x)) {
    x.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    if (x.length === 0) out.set(prefix, '[]');
    return;
  }
  if (isObj(x)) {
    for (const [k, v] of Object.entries(x)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return;
  }
  out.set(prefix, x);
}

/** Flattened JSON diff of two PlanStates with human labels. */
export function diffStates(a: unknown, b: unknown): DiffRow[] {
  const fa = new Map<string, unknown>();
  const fb = new Map<string, unknown>();
  flatten(a, '', fa);
  flatten(b, '', fb);
  const keys = new Set<string>([...fa.keys(), ...fb.keys()]);
  const rows: DiffRow[] = [];
  for (const k of keys) {
    if (k === 'version') continue;
    const inA = fa.has(k);
    const inB = fb.has(k);
    const va = fa.get(k);
    const vb = fb.get(k);
    if (inA && inB && Object.is(va, vb)) continue;
    if (inA && inB && typeof va === 'number' && typeof vb === 'number' && Math.abs(va - vb) < 1e-9) continue;
    rows.push({ path: k, label: labelForPath(k), before: inA ? va : undefined, after: inB ? vb : undefined, kind: !inA ? 'added' : !inB ? 'removed' : 'changed' });
  }
  rows.sort((x, y) => x.path.localeCompare(y.path));
  return rows;
}

export function fmtDiffValue(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'none';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v.toLocaleString('en-US');
    return v < 1 && v > -1 ? v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return String(v);
}
