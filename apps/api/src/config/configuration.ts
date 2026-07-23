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
  mail: {
    host?: string;
    port: number;
    user?: string;
    password?: string;
    from: string;
    fromName: string;
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
  mail: {
    host: process.env.SMTP_HOST || undefined,
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    from: process.env.EMAIL_FROM ?? 'no-reply@footlink.ch',
    fromName: process.env.EMAIL_FROM_NAME ?? 'FootLink',
  },
});
