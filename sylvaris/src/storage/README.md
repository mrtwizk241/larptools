IndexedDB persistence (idb-keyval), save schema versions, and migrations.

- `repository.ts`: the `Repository` interface the UI uses. A server implementation can replace it.
- `idb.ts`: IndexedDB implementation. Database `sylvaris`, store `kv`. Every read is validated; invalid records are listed in `invalid`, never thrown from a list.
- `migrations.ts`: migration steps keyed by `meta.schemaVersion`. Characters are also upgraded on read. Sylvaris data starts at schema version 1 with no steps; add one per later version bump.
- `pin.ts`: staff PIN hash. A convenience lock, not security.
