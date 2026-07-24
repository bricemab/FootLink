/**
 * Identité d'une adresse email.
 *
 * Deux adresses qui aboutissent dans la même boîte sont le **même compte**.
 * Sans cette règle, `brice@gmail.com`, `brice+foot@gmail.com` et
 * `b.rice@gmail.com` créent trois comptes FootLink pour une seule personne :
 * trois profils joueur, trois fois les mêmes candidatures reçues par un club,
 * et un moyen trivial de contourner un blocage ou une suspension.
 *
 * Deux règles, volontairement inégales :
 *
 * 1. **Le suffixe `+…` est retiré partout.** L'adressage par étiquette est
 *    quasi universel (Gmail, Outlook, Fastmail, Proton, iCloud…) et sert
 *    précisément à démultiplier une adresse. Un `+` littéral dans une vraie
 *    adresse est théoriquement légal (RFC 5321) mais introuvable en pratique.
 *    Le compromis est assumé : on préfère refuser un doublon qu'accepter un
 *    contournement.
 *
 * 2. **Les points ne sont retirés que chez Google.** Gmail les ignore, mais
 *    ailleurs ils sont significatifs : `jean.dupont@bluewin.ch` et
 *    `jeandupont@bluewin.ch` sont deux personnes différentes. Généraliser
 *    fusionnerait des comptes distincts — une faute autrement plus grave que
 *    laisser passer un doublon.
 *
 * ⚠️ La forme normalisée est celle qui est **stockée** et qui sert de clé
 * unique. Elle sert aussi de destinataire aux emails : Gmail délivre
 * indifféremment aux deux formes.
 */

const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();

  // On coupe sur le DERNIER `@` : le local-part peut légalement en contenir
  // (entre guillemets), le domaine jamais.
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) {
    // Adresse non conforme : la validation du DTO s'en chargera, on ne
    // fabrique surtout pas une valeur qui ressemblerait à une adresse valide.
    return email;
  }

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);

  const plus = local.indexOf('+');
  if (plus >= 0) {
    local = local.slice(0, plus);
  }

  if (GOOGLE_DOMAINS.has(domain)) {
    domain = 'gmail.com';
    local = local.replace(/\./g, '');
  }

  // Un local-part vide (« +foo@gmail.com ») n'est pas une adresse : on rend
  // l'entrée telle quelle plutôt qu'un « @gmail.com » qui pourrait entrer en
  // collision avec une autre saisie tout aussi absurde.
  return local.length > 0 ? `${local}@${domain}` : email;
}

/** Deux saisies désignent-elles la même boîte mail ? */
export function isSameEmail(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}
