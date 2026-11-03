/**
 * Drizzle schema. Mirrors server/db/migrations/*.sql (the SQL files are the source of truth for DDL).
 */
import { bigserial, boolean, bigint, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  role: text('role', { enum: ['admin', 'advisor', 'client'] }).notNull(),
  displayName: text('display_name').notNull().default(''),
  status: text('status', { enum: ['invited', 'active', 'disabled'] }).notNull().default('invited'),
  totpSecretEnc: text('totp_secret_enc'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  totpLastCounter: bigint('totp_last_counter', { mode: 'number' }),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: ts('locked_until'),
  passwordChangedAt: ts('password_changed_at'),
  createdAt: ts('created_at').notNull(),
  lastLoginAt: ts('last_login_at'),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    mfaVerified: boolean('mfa_verified').notNull().default(true),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    invitedBy: uuid('invited_by'),
    expiresAt: ts('expires_at').notNull(),
    acceptedAt: ts('accepted_at'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('invites_user_idx').on(t.userId)],
);

export const advisorClients = pgTable(
  'advisor_clients',
  {
    advisorId: uuid('advisor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.advisorId, t.clientId] }), index('advisor_clients_client_idx').on(t.clientId)],
);

export const plans = pgTable('plans', {
  clientId: uuid('client_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  stateEnc: text('state_enc').notNull(),
  updatedAt: ts('updated_at').notNull(),
  updatedBy: uuid('updated_by'),
});

export const planVersions = pgTable(
  'plan_versions',
  {
    clientId: uuid('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    stateEnc: text('state_enc').notNull(),
    createdAt: ts('created_at').notNull(),
    createdBy: uuid('created_by'),
    reason: text('reason').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.clientId, t.version] })],
);

export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey(),
    clientId: uuid('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull(),
    title: text('title').notNull(),
    note: text('note').notNull().default(''),
    status: text('status', { enum: ['draft', 'submitted', 'approved', 'rejected', 'withdrawn'] }).notNull().default('draft'),
    stateEnc: text('state_enc').notNull(),
    baseVersion: integer('base_version').notNull().default(0),
    reviewNote: text('review_note'),
    reviewerId: uuid('reviewer_id'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    submittedAt: ts('submitted_at'),
    reviewedAt: ts('reviewed_at'),
  },
  (t) => [index('proposals_client_idx').on(t.clientId), index('proposals_status_idx').on(t.status)],
);

export const chatThreads = pgTable(
  'chat_threads',
  {
    id: uuid('id').primaryKey(),
    clientId: uuid('client_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').notNull(),
    title: text('title').notNull().default(''),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [index('chat_threads_client_idx').on(t.clientId)],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey(),
    threadId: uuid('thread_id').notNull().references(() => chatThreads.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    contentEnc: text('content_enc').notNull(),
    mode: text('mode', { enum: ['claude', 'offline'] }).notNull().default('offline'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('chat_messages_thread_idx').on(t.threadId)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: ts('at').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ip: text('ip'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('audit_log_at_idx').on(t.at), index('audit_log_actor_idx').on(t.actorId)],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type ProposalRow = typeof proposals.$inferSelect;
export type ChatThreadRow = typeof chatThreads.$inferSelect;
