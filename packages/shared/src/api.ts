// Contrats d'API partagés entre backend et mobile (typage end-to-end).

export interface AppConfigResponse {
  minVersion: string;
  latestVersion: string;
  maintenance: boolean;
}
