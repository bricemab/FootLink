import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Locale } from '@prisma/client';
import { createTransport, Transporter } from 'nodemailer';
import { LinksService } from '../links/links.service';

/**
 * Échappe les caractères spéciaux HTML avant interpolation dans un CORPS
 * d'email (audit #1 : un nom de club ou un prénom librement saisi ne doit pas
 * pouvoir injecter de HTML dans un email brandé FootLink).
 *
 * À n'appliquer JAMAIS aux sujets : un sujet est du texte brut, les entités
 * s'y afficheraient littéralement (`&amp;` au lieu de `&`).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
          // Hors port 465 (TLS implicite), STARTTLS est EXIGÉ : sans requireTLS,
          // nodemailer retombe en clair si le serveur ne l'annonce pas
          // (STARTTLS stripping) — credentials SMTP et jetons en clair (audit #8).
          requireTLS: port !== 465,
          tls: { minVersion: 'TLSv1.2' },
          auth: { user, pass: password },
          /*
           * 🔴 **Connexion mutualisee, et ce n'est pas de l'optimisation
           * gratuite.** Gmail retarde volontairement l'ACCEPTATION DU MOT DE
           * PASSE quand un compte se met a envoyer par SMTP : mesure au
           * chronometre, commande par commande, le 27 juillet —
           *
           *     banniere 71 ms · EHLO 31 ms · AUTH 26 ms
           *     mot de passe 5664 ms   <-- ici
           *     MAIL FROM 26 ms · RCPT TO 22 ms
           *
           * Tout le protocole repond en ~25 ms, seule l'authentification est
           * freinee. Sans pool, ces 5,6 s se paient A CHAQUE message ; avec, une
           * seule fois pour toute la vie de la connexion.
           *
           * `maxConnections: 1` : ouvrir plusieurs sessions en parallele sur un
           * compte deja freine, c'est demander a l'etre davantage.
           */
          pool: true,
          maxConnections: 1,
          maxMessages: 100,
          /*
           * Delais BORNES. Sans eux, une session qui pend retient une tache de
           * fond indefiniment et personne ne l'apprend jamais — la promesse
           * n'etant plus attendue par personne depuis le decouplage. Larges,
           * parce qu'un envoi reel a deja pris 85 s sur ce reseau : trop courts,
           * ils feraient echouer des envois qui aboutissaient.
           */
          connectionTimeout: 30_000,
          greetingTimeout: 30_000,
          socketTimeout: 180_000,
        })
      : createTransport({ jsonTransport: true });

    if (!this.enabled) {
      // Ceinture et bretelles : validateEnv refuse déjà ce cas au boot. Sans ce
      // garde-fou, une prod sans SMTP journaliserait les jetons en clair (audit #2).
      if (this.config.get<string>('nodeEnv') === 'production') {
        throw new Error('SMTP_HOST, SMTP_USER et SMTP_PASSWORD sont obligatoires en production.');
      }
      // Le token reste logué en dev/test UNIQUEMENT : les scripts tools/e2e le
      // relisent dans les logs (format `[email simulé] … | token=…`). En
      // production, ce chemin est rendu impossible par le fail-fast ci-dessus.
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

  /**
   * Code d'inscription à 6 chiffres. Pas de lien ici : l'utilisateur est déjà
   * devant l'app, en train d'attendre ce code — un lien le ferait sortir de son
   * parcours pour y revenir.
   */
  async sendSignupCodeEmail(to: string, code: string, locale: Locale): Promise<void> {
    const isDe = locale === Locale.DE;
    const subject = isDe ? 'Dein FootLink-Code' : 'Ton code FootLink';
    const intro = isDe
      ? 'Gib diesen Code in der App ein, um deine E-Mail-Adresse zu bestätigen:'
      : "Saisis ce code dans l'app pour confirmer ton adresse email :";
    const validity = isDe ? 'Der Code ist 24 Stunden gültig.' : 'Le code est valable 24 heures.';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>FootLink</h2>
        <p>${intro}</p>
        <p style="font-size:34px;font-weight:700;letter-spacing:10px;margin:24px 0">${code}</p>
        <p style="color:#666;font-size:13px">${validity}</p>
      </div>`;
    await this.deliver(to, subject, html);
    if (!this.enabled) {
      // Même forme que les autres emails simulés, pour les scripts de test.
      this.logger.debug(`[email simulé] ${subject} -> ${to} | token=${code}`);
    }
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
    // Données saisies librement (prénom au formulaire, nom de club par le
    // CLUB_ADMIN) : échappées avant interpolation dans le HTML (audit #1).
    // Le sujet garde les valeurs brutes : c'est du texte, pas du HTML.
    const safeFirstName = escapeHtml(firstName);
    const safeClubName = escapeHtml(clubName);
    const greeting = firstName.trim().length > 0 ? `${isDe ? 'Hallo' : 'Salut'} ${safeFirstName}, ` : '';
    const subject = isDe ? `Trainerkonto bei ${clubName}` : `Compte entraîneur chez ${clubName}`;
    const intro = isDe
      ? `${greeting}${safeClubName} hat dir ein Trainerkonto auf FootLink erstellt.`
      : `${greeting}${safeClubName} t'a créé un compte entraîneur sur FootLink.`;
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
    // Même traitement que sendCoachInviteEmail : HTML échappé, sujet brut (audit #1).
    const safeFirstName = escapeHtml(firstName);
    const safeClubName = escapeHtml(clubName);
    const greeting = firstName.trim().length > 0 ? `${isDe ? 'Hallo' : 'Salut'} ${safeFirstName}, ` : '';
    const subject = isDe ? `Du bist jetzt Trainer bei ${clubName}` : `Tu es entraîneur chez ${clubName}`;
    const intro = isDe
      ? `${greeting}${safeClubName} hat dich als Trainer hinzugefügt. Melde dich wie gewohnt in der App an.`
      : `${greeting}${safeClubName} t'a ajouté comme entraîneur. Connecte-toi normalement dans l'app.`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>FootLink</h2>
        <p><b>${safeClubName}</b></p>
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
    // Nom de club saisi par le demandeur : échappé dans le HTML, brut dans le
    // sujet (texte, pas HTML) — audit #1.
    const safeClubName = escapeHtml(clubName);
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
        <p><b>${safeClubName}</b></p>
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
