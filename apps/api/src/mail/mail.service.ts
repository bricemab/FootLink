import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Locale } from '@prisma/client';
import { createTransport, Transporter } from 'nodemailer';
import { LinksService } from '../links/links.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly links: LinksService,
  ) {
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
    const link = this.links.buildEmailLink('verify-email', { token });
    const isDe = locale === Locale.DE;
    const subject = isDe ? 'Bestätige deine E-Mail-Adresse' : 'Confirme ton adresse email';
    const intro = isDe
      ? 'Willkommen bei FootLink! Bestätige deine E-Mail-Adresse:'
      : 'Bienvenue sur FootLink ! Confirme ton adresse email :';
    await this.send(to, subject, intro, link, token, isDe);
  }

  async sendPasswordResetEmail(to: string, token: string, locale: Locale): Promise<void> {
    const link = this.links.buildEmailLink('reset-password', { token });
    const isDe = locale === Locale.DE;
    const subject = isDe ? 'Passwort zurücksetzen' : 'Réinitialise ton mot de passe';
    const intro = isDe
      ? 'Setze dein FootLink-Passwort zurück:'
      : 'Réinitialise ton mot de passe FootLink :';
    await this.send(to, subject, intro, link, token, isDe);
  }

  /**
   * Invitation entraîneur : un code à 6 chiffres, que l'invité recopie dans
   * l'app après avoir choisi « Je suis entraîneur ». Le lien fait la même chose
   * en un clic (il pré-remplit email et code) ; le code reste là pour qui
   * consulte ses mails sur un autre appareil que son téléphone.
   * Le code en clair n'existe que dans cet email.
   */
  async sendCoachInviteEmail(
    to: string,
    firstName: string,
    clubName: string,
    code: string,
    locale: Locale,
  ): Promise<void> {
    const link = this.links.buildEmailLink('coach-invite', { email: to, code });
    const isDe = locale === Locale.DE;
    const greeting = firstName.trim().length > 0 ? `${isDe ? 'Hallo' : 'Salut'} ${firstName}, ` : '';
    const subject = isDe ? `Trainerkonto bei ${clubName}` : `Compte entraîneur chez ${clubName}`;
    const intro = isDe
      ? `${greeting}${clubName} hat dir ein Trainerkonto auf FootLink erstellt.`
      : `${greeting}${clubName} t'a créé un compte entraîneur sur FootLink.`;
    const instruction = isDe
      ? 'Wähle in der App « Ich bin Trainer », gib diese E-Mail-Adresse und den folgenden Code ein:'
      : "Dans l'app, choisis « Je suis entraîneur », saisis cette adresse email puis ce code :";
    const validity = isDe ? 'Der Code ist 7 Tage gültig.' : 'Le code est valable 7 jours.';
    const cta = isDe ? 'In der App öffnen' : "Ouvrir dans l'app";

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>FootLink</h2>
        <p>${intro}</p>
        <p>${instruction}</p>
        <p style="font-size:34px;font-weight:700;letter-spacing:10px;margin:24px 0">${code}</p>
        <p style="color:#666;font-size:13px">${validity}</p>
        <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none">${cta}</a></p>
      </div>`;
    await this.deliver(to, subject, html);
    if (!this.enabled) {
      // Même forme que les autres emails simulés, pour que les scripts de test
      // puissent relire le code.
      this.logger.debug(`[email simulé] ${subject} -> ${to} | token=${code}`);
    }
  }

  // L'invité avait déjà un compte FootLink : rien à définir, simple information.
  async sendCoachAddedEmail(
    to: string,
    firstName: string,
    clubName: string,
    locale: Locale,
  ): Promise<void> {
    const isDe = locale === Locale.DE;
    const greeting = firstName.trim().length > 0 ? `${isDe ? 'Hallo' : 'Salut'} ${firstName}, ` : '';
    const subject = isDe ? `Du bist jetzt Trainer bei ${clubName}` : `Tu es entraîneur chez ${clubName}`;
    const intro = isDe
      ? `${greeting}${clubName} hat dich als Trainer hinzugefügt. Melde dich wie gewohnt in der App an.`
      : `${greeting}${clubName} t'a ajouté comme entraîneur. Connecte-toi normalement dans l'app.`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>FootLink</h2>
        <p><b>${clubName}</b></p>
        <p>${intro}</p>
      </div>`;
    await this.deliver(to, subject, html);
  }

  // Décision du SUPER_ADMIN sur une demande de club (Phase 3).
  async sendClubDecisionEmail(
    to: string,
    clubName: string,
    approved: boolean,
    locale: Locale,
  ): Promise<void> {
    const isDe = locale === Locale.DE;
    const subject = approved
      ? isDe
        ? `Verein ${clubName} freigegeben`
        : `Club ${clubName} validé`
      : isDe
        ? `Antrag für ${clubName} abgelehnt`
        : `Demande pour ${clubName} refusée`;
    const intro = approved
      ? isDe
        ? 'Dein Verein wurde freigegeben. Du kannst jetzt Teams und Trainerkonten anlegen.'
        : 'Ton club a été validé. Tu peux maintenant créer tes équipes et les comptes entraîneurs.'
      : isDe
        ? 'Dein Antrag für ein Vereinskonto wurde abgelehnt.'
        : 'Ta demande de compte club a été refusée.';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>FootLink</h2>
        <p><b>${clubName}</b></p>
        <p>${intro}</p>
      </div>`;
    await this.deliver(to, subject, html);
  }

  private async deliver(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      if (!this.enabled) {
        this.logger.debug(`[email simulé] ${subject} -> ${to}`);
      }
    } catch (error) {
      this.logger.error(
        `Échec envoi email à ${to}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
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
