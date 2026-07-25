export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  version: {
    min: string;
    latest: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number; // secondes
    refreshTtl: number; // secondes
  };
  google: {
    clientIds: string[]; // audiences acceptées pour la vérif du jeton ID
  };
  media: {
    /**
     * Stockage compatible S3 (Cloudflare R2 au MVP, cf. AGENTS §2 et HANDOFF 32).
     * Vide = uploads désactivés : l'API répond 503 plutôt que de fabriquer des
     * URL invalides.
     */
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  };
  mapbox: {
    /**
     * Jeton public Mapbox, utilisé pour la recherche de lieux (Search Box).
     * Vide = recherche indisponible : l'app bascule sur la saisie manuelle
     * plutôt que de renvoyer des résultats faux.
     */
    token: string;
  };
  mail: {
    host?: string;
    port: number;
    user?: string;
    password?: string;
    from: string;
    fromName: string;
  };
  links: {
    /** Base HTTPS des liens envoyés par email (page de rebond vers l'app). */
    publicBaseUrl: string;
    iosStoreUrl: string;
    androidStoreUrl: string;
  };
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export default (): AppConfiguration => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 3000),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  version: {
    min: process.env.API_MIN_VERSION ?? '1.0.0',
    latest: process.env.API_LATEST_VERSION ?? '1.0.0',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessTtl: int(process.env.JWT_ACCESS_TTL, 900),
    refreshTtl: int(process.env.JWT_REFRESH_TTL, 2592000),
  },
  google: {
    clientIds: (process.env.GOOGLE_CLIENT_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  media: {
    endpoint: process.env.S3_ENDPOINT ?? '',
    region: process.env.S3_REGION ?? 'auto',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    bucket: process.env.S3_BUCKET ?? '',
  },
  mapbox: {
    token: process.env.MAPBOX_TOKEN ?? '',
  },
  mail: {
    host: process.env.SMTP_HOST || undefined,
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    from: process.env.EMAIL_FROM ?? 'no-reply@footlink.ch',
    fromName: process.env.EMAIL_FROM_NAME ?? 'FootLink',
  },
  links: {
    // En dev, pointer sur l'IP de la machine (ex. http://192.168.1.20:3000)
    // pour que le lien reçu sur le téléphone soit réellement joignable.
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'https://footlink.ch').replace(/\/+$/, ''),
    // L'identifiant App Store n'existe qu'une fois l'app publiée : d'ici là, on
    // renvoie sur la recherche du store plutôt que sur une page inexistante.
    iosStoreUrl: process.env.IOS_STORE_URL ?? 'https://apps.apple.com/ch/search?term=footlink',
    androidStoreUrl:
      process.env.ANDROID_STORE_URL ??
      'https://play.google.com/store/apps/details?id=ch.footlink.app',
  },
});
