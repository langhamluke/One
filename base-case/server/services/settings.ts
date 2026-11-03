/**
 * Firm settings stored as key/value JSON rows. Defaults come from config/env.
 */
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { SettingsRecord } from '../../shared/api';
import type { AppDeps } from '../types';
import { settings } from '../db/schema';

export const DEFAULT_DISCLAIMER =
  'Prepared for discussion purposes. Hypothetical projections based on stated assumptions and publicly available salary and tax data as of the dates shown; not investment, tax, or legal advice. Actual results will vary.';

export function defaultSettings(firmName: string): SettingsRecord {
  return {
    firmName,
    disclaimer: DEFAULT_DISCLAIMER,
    assistantEnabled: true,
    inviteExpiryHours: 72,
    sessionHours: 12,
    requireMfaForStaff: false,
  };
}

export const settingsPatchSchema = z
  .object({
    firmName: z.string().trim().min(1).max(120),
    disclaimer: z.string().max(2000),
    assistantEnabled: z.boolean(),
    inviteExpiryHours: z.number().int().min(1).max(24 * 30),
    sessionHours: z.number().int().min(1).max(24 * 7),
    requireMfaForStaff: z.boolean(),
  })
  .partial()
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

const KEYS = ['firmName', 'disclaimer', 'assistantEnabled', 'inviteExpiryHours', 'sessionHours', 'requireMfaForStaff'] as const;

export async function getSettings(deps: Pick<AppDeps, 'db' | 'config'>): Promise<SettingsRecord> {
  const base = defaultSettings(deps.config.firmName);
  const rows = await deps.db.select().from(settings);
  const out: Record<string, unknown> = { ...base };
  for (const r of rows) {
    if ((KEYS as readonly string[]).includes(r.key)) out[r.key] = r.value;
  }
  const parsed = settingsPatchSchema.safeParse(out);
  return parsed.success ? { ...base, ...parsed.data } : base;
}

export async function updateSettings(deps: Pick<AppDeps, 'db' | 'config'>, patch: SettingsPatch): Promise<SettingsRecord> {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    await deps.db
      .insert(settings)
      .values({ key: k, value: v })
      .onConflictDoUpdate({ target: settings.key, set: { value: v } });
  }
  return getSettings(deps);
}

export async function getSetting<K extends keyof SettingsRecord>(deps: Pick<AppDeps, 'db' | 'config'>, key: K): Promise<SettingsRecord[K]> {
  const base = defaultSettings(deps.config.firmName);
  const [row] = await deps.db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row) return base[key];
  const parsed = settingsPatchSchema.safeParse({ [key]: row.value });
  return parsed.success && parsed.data[key] !== undefined ? (parsed.data[key] as SettingsRecord[K]) : base[key];
}
