export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  version: {
    min: string;
    latest: string;
  };
}

export default (): AppConfiguration => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  version: {
    min: process.env.API_MIN_VERSION ?? '1.0.0',
    latest: process.env.API_LATEST_VERSION ?? '1.0.0',
  },
});
