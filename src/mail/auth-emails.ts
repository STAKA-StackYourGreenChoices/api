import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

/** The account emails STAKA sends, with links into the web app. */
@Injectable()
export class AuthEmails {
  private readonly webAppUrl: string;

  constructor(
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.webAppUrl = (
      config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  sendVerification(to: string, name: string, token: string) {
    const link = `${this.webAppUrl}/verify-email?token=${encodeURIComponent(token)}`;
    return this.mail.send({
      to,
      subject: 'Confirm your STAKA email',
      text: `Hi ${name},\n\nConfirm your email address to finish setting up your STAKA account:\n${link}\n\nIf you didn't create an account, you can ignore this email.`,
    });
  }

  sendPasswordReset(to: string, name: string, token: string, expiresAt: Date) {
    const link = `${this.webAppUrl}/reset-password?token=${encodeURIComponent(token)}`;
    return this.mail.send({
      to,
      subject: 'Reset your STAKA password',
      text: `Hi ${name},\n\nUse this link to choose a new password. It works once and expires at ${expiresAt.toISOString()}:\n${link}\n\nIf you didn't ask for this, you can ignore this email; your password hasn't changed.`,
    });
  }
}
