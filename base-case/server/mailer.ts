/**
 * Mailer. There is no SMTP integration yet: invite/reset links are written to the log so an admin can copy them.
 * (The link is the only place a raw token is ever logged; it is deliberate and documented.)
 */
import type { Logger } from './log';
import type { Mailer } from './types';

export function consoleMailer(logger: Logger): Mailer {
  return {
    async sendInvite(msg) {
      logger.info('invite link (deliver out-of-band)', { kind: msg.kind, to: msg.to, inviteUrl: msg.inviteUrl, expiresAt: msg.expiresAt.toISOString() });
    },
  };
}

export const silentMailer: Mailer = { async sendInvite() {} };
