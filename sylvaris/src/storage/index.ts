// Public storage API. All reads and writes go through a Repository so a server can replace it.
import { createIdbRepository } from './idb.ts';
import type { Repository } from './repository.ts';

export {
  createIdbRepository,
  DB_NAME,
  STORE_NAME,
  keys,
  type IdbRepositoryOptions,
} from './idb.ts';
export {
  MIGRATIONS,
  migrateCharacterRecord,
  type Migration,
  type MigrationContext,
} from './migrations.ts';
export { hashPin, isValidPin, verifyPin } from './pin.ts';
export {
  InvalidRecordError,
  type InvalidRecord,
  type ListResult,
  type MigrationReport,
  type Repository,
  type SaveCharacterOptions,
} from './repository.ts';
export { clearServerCache, createRemoteRepository } from './remote.ts';

/** The app's repository: IndexedDB database `sylvaris`, store `kv`. Opens lazily on first use. */
export const repository: Repository = createIdbRepository();
export default repository;
