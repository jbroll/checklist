import schemaLock from './schema.lock.json';

// The sync appVersion. A tenant sits at the lock's last version and refuses a lower one as schema_behind.
export const SCHEMA_VERSION = schemaLock.versions[schemaLock.versions.length - 1].version;
