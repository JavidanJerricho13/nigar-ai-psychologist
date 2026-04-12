import nodemailer, { Transporter } from 'nodemailer';

/**
 * Lightweight nodemailer wrapper for the admin process.
 *
 * Required env (when MAILER_ENABLED=true):
 *   - SMTP_HOST
 *   - SMTP_PORT
 *   - SMTP_USER
 *   - SMTP_PASS
 *   - SMTP_FROM        e.g. "Nigar AI <reports@nigar.ai>"
 *   - REPORT_EMAIL_TO  comma-separated recipient list
 *
 * If MAILER_ENABLED !== 'true' or any required field is missing, send() is a no-op
 * that logs a warning. The cron must NEVER throw because the mailer is misconfigured.
 */
export class MailerService {
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly defaultTo: string;

  constructor() {
    const enabled = (process.env.MAILER_ENABLED ?? '').toLowerCase() === 'true';
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    this.from = process.env.SMTP_FROM ?? 'Nigar AI <no-reply@nigar.ai>';
    this.defaultTo = process.env.REPORT_EMAIL_TO ?? '';

    if (!enabled || !host || !user || !pass) {
      console.warn(
        '[Mailer] Disabled — set MAILER_ENABLED=true plus SMTP_HOST/SMTP_USER/SMTP_PASS to enable.',
      );
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  get isEnabled(): boolean {
    return !!this.transporter && this.defaultTo.length > 0;
  }

  /** Send mail. Catches errors so callers (cron jobs) never crash. */
  async send(args: { to?: string; subject: string; html: string; text?: string }): Promise<boolean> {
    if (!this.transporter) {
      console.warn(`[Mailer] Skipped (disabled): "${args.subject}"`);
      return false;
    }
    const recipients = args.to ?? this.defaultTo;
    if (!recipients) {
      console.warn(`[Mailer] Skipped (no recipients): "${args.subject}"`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: recipients,
        subject: args.subject,
        html: args.html,
        text: args.text,
      });
      console.log(`[Mailer] Sent "${args.subject}" → ${recipients}`);
      return true;
    } catch (err) {
      console.error(`[Mailer] Failed to send "${args.subject}":`, (err as Error).message);
      return false;
    }
  }
}
