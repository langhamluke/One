import type { z } from 'zod';
import type { AppContext } from '../auth/middleware';
import { badRequest } from '../errors';

/** Parse and validate a JSON body. Invalid JSON or schema failure -> 400 with a short message. */
export async function parseBody<T extends z.ZodTypeAny>(c: AppContext, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    const text = await c.req.text();
    raw = text.trim() === '' ? {} : JSON.parse(text);
  } catch {
    throw badRequest('Invalid JSON body', 'invalid_json');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? issue.path.join('.') : 'body';
    throw badRequest(`Invalid request: ${where}: ${issue?.message ?? 'invalid'}`, 'invalid_body');
  }
  return parsed.data;
}

/** Parse a JSON body without a schema (used by plan routes which validate with validatePlanState). */
export async function parseJson(c: AppContext): Promise<unknown> {
  try {
    const text = await c.req.text();
    return text.trim() === '' ? {} : JSON.parse(text);
  } catch {
    throw badRequest('Invalid JSON body', 'invalid_json');
  }
}
