export interface LocalReadiness {
  version: string;
  databaseReady: boolean;
  migrationsReady: boolean;
  chromiumReady: boolean;
  collectionUiEnabled: boolean;
  localhostSafe: boolean;
  latestBackupAvailable: boolean;
}
