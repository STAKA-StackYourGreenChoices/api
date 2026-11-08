import { Global, Module } from '@nestjs/common';
import { AuthEmails } from './auth-emails';
import { MailService } from './mail.service';

@Global()
@Module({
  providers: [MailService, AuthEmails],
  exports: [MailService, AuthEmails],
})
export class MailModule {}
