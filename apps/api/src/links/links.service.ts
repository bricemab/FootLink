import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Actions atteignables depuis un email. Le libellé de gauche est ce qui apparaît
 * dans l'URL ; la valeur est la route de l'app derrière le scheme `footlink://`.
 */
export const LINK_ACTIONS = {
  'verify-email': 'auth/verify-email',
  'reset-password': 'auth/reset-password',
  // L'entraîneur invité arrive directement sur son écran d'activation, avec
  // email et code pré-remplis : c'est le même écran que s'il avait choisi
  // « Je suis entraîneur » à l'inscription.
  'coach-invite': 'register/coach',
} as const;

export type LinkAction = keyof typeof LINK_ACTIONS;

export function isLinkAction(value: string): value is LinkAction {
  return value in LINK_ACTIONS;
}

const APP_SCHEME = 'footlink://';

@Injectable()
export class LinksService {
  constructor(private readonly config: ConfigService) {}

  /** URL HTTPS à mettre dans un email : elle rebondit vers l'app ou vers le store. */
  buildEmailLink(action: LinkAction, params: Record<string, string>): string {
    const base = this.config.getOrThrow<string>('links.publicBaseUrl');
    return `${base}/l/${action}?${new URLSearchParams(params).toString()}`;
  }

  /**
   * Page de rebond.
   *
   * Un lien `footlink://` seul ne fonctionne que si l'app est déjà installée :
   * ouvert dans un navigateur (desktop, webmail), il ne fait rien. On sert donc
   * une page HTTPS qui tente d'ouvrir l'app, et bascule sur le store si rien ne
   * s'est passé — signe que l'app est absente.
   *
   * La bascule est annulée dès que la page perd le focus (`visibilitychange`) :
   * c'est ce qui se produit quand l'app s'ouvre vraiment, et ça évite d'envoyer
   * sur le store quelqu'un qui a l'app.
   */
  renderBouncePage(action: LinkAction, params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString();
    const deepLink = `${APP_SCHEME}${LINK_ACTIONS[action]}${query.length > 0 ? `?${query}` : ''}`;
    const ios = this.config.getOrThrow<string>('links.iosStoreUrl');
    const android = this.config.getOrThrow<string>('links.androidStoreUrl');

    // Les paramètres transitent déjà dans l'URL de l'email : ils sont réinjectés
    // tels quels dans le lien de l'app. On les échappe pour qu'ils ne puissent
    // fermer ni l'attribut HTML ni la chaîne JavaScript.
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>FootLink</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #07130F; color: #F4FBF7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 24px; text-align: center;
  }
  .card { max-width: 420px; }
  .brand { font-size: 13px; letter-spacing: 3px; font-weight: 700; color: #39FF88; }
  h1 { font-size: 26px; line-height: 1.25; margin: 12px 0 8px; }
  p { color: #A9C4B8; line-height: 1.5; margin: 0 0 24px; }
  a.button {
    display: inline-block; padding: 15px 26px; border-radius: 16px;
    background: #39FF88; color: #07130F; font-weight: 700; text-decoration: none;
  }
  a.store { display: block; margin-top: 16px; color: #A9C4B8; font-size: 14px; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">FOOTLINK</div>
    <h1>On ouvre l'application…</h1>
    <p>Si rien ne se passe, installe FootLink puis rouvre ce lien.</p>
    <a class="button" id="open" href="${escapeHtml(deepLink)}">Ouvrir FootLink</a>
    <a class="store" id="store" href="${escapeHtml(android)}">Télécharger l'application</a>
  </div>
<script>
(function () {
  var deepLink = ${JSON.stringify(deepLink)};
  var ios = ${JSON.stringify(ios)};
  var android = ${JSON.stringify(android)};
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua);
  var isAndroid = /Android/.test(ua);
  var store = isIOS ? ios : android;
  document.getElementById('store').href = store;

  // Sur desktop, l'app n'existe pas : on laisse la page telle quelle.
  if (!isIOS && !isAndroid) { return; }

  var settled = false;
  function settle() { settled = true; }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { settle(); }
  });
  window.addEventListener('pagehide', settle);
  window.addEventListener('blur', settle);

  window.location.href = deepLink;
  setTimeout(function () {
    if (!settled && !document.hidden) { window.location.replace(store); }
  }, 1600);
})();
</script>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
