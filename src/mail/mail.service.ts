import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends transactional email.
 *
 * With SMTP_URL set (any provider: Resend, SES, Postmark, or a local Mailpit),
 * mail goes out over SMTP. Without it, the message is written to the server
 * log instead, so reset and verification links can be tested locally without
 * an email account. Production must set SMTP_URL.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const smtpUrl = config.get<string>('SMTP_URL');
    this.from =
      config.get<string>('MAIL_FROM') ?? 'STAKA <no-reply@staka.local>';
    if (smtpUrl) this.transporter = createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `SMTP_URL not set; email not sent.\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({ from: this.from, ...message });
    } catch (error) {
      // A mail outage must not turn into a 500 that tells the caller whether
      // an account exists. Log it and let monitoring pick it up.
      this.logger.error(
        `Failed to send "${message.subject}" email`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
