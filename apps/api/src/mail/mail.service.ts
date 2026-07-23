import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Locale } from '@prisma/client';
import { createTransport, Transporter } from 'nodemailer';

// Deep link mobile pour ouvrir l'app directement sur l'écran concerné.
const DEEP_LINK_SCHEME = 'footlink://';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('mail.host');
    const port = this.config.get<number>('mail.port') ?? 587;
    const user = this.config.get<string>('mail.user');
    const password = this.config.get<string>('mail.password');
    const fromName = this.config.get<string>('mail.fromName') ?? 'FootLink';
    const fromAddr = this.config.get<string>('mail.from') ?? 'no-reply@footlink.ch';
    this.from = `${fromName} <${fromAddr}>`;
    this.enabled = Boolean(host && user && password);

    this.transporter = this.enabled
      ? createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass: password },
        })
      : createTransport({ jsonTransport: true });

    if (!this.enabled) {
      this.logger.warn('SMTP non configuré : les emails seront logués (jsonTransport).');
    }
  }

  async sendVerificationEmail(to: string, token: string, locale: Locale): Promise<void> {
    const link = `${DEEP_LINK_SCHEME}auth/verify-email?token=${encodeURIComponent(token)}`;
    const isDe = locale === Locale.DE;
    const subject = isDe ? 'Bestätige deine E-Mail-Adresse' : 'Confirme ton adresse email';
    const intro = isDe
      ? 'Willkommen bei FootLink! Bestätige deine E-Mail-Adresse:'
      : 'Bienvenue sur FootLink ! Confirme ton adresse email :';
    await this.send(to, subject, intro, link, token, isDe);
  }

  async sendPasswordResetEmail(to: string, token: string, locale: Locale): Promise<void> {
    const link = `${DEEP_LINK_SCHEME}auth/reset-password?token=${encodeURIComponent(token)}`;
    const isDe = locale === Locale.DE;
    const subject = isDe ? 'Passwort zurücksetzen' : 'Réinitialise ton mot de passe';
    const intro = isDe
      ? 'Setze dein FootLink-Passwort zurück:'
      : 'Réinitialise ton mot de passe FootLink :';
    await this.send(to, subject, intro, link, token, isDe);
  }

  private async send(
    to: string,
    subject: string,
    intro: string,
    link: string,
    token: string,
    isDe: boolean,
  ): Promise<void> {
    const codeLabel = isDe ? 'Oder gib diesen Code in der App ein:' : 'Ou saisis ce code dans l’app :';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>FootLink</h2>
        <p>${intro}</p>
        <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none">${subject}</a></p>
        <p style="color:#666;font-size:13px">${codeLabel}<br><code>${token}</code></p>
      </div>`;
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      if (!this.enabled) {
        this.logger.debug(`[email simulé] ${subject} -> ${to} | token=${token}`);
      }
    } catch (error) {
      this.logger.error(`Échec envoi email à ${to}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
}
