// Tells open screens that a character was saved, so useSheet shows the new state without a
// reload. One channel per repository.
import type { StoredCharacter } from '../../engine/model.ts';
import type { Repository } from '../../storage/repository.ts';

type Listener = (character: StoredCharacter) => void;

const channels = new WeakMap<Repository, Set<Listener>>();

/** Calls `listener` after every save published for `repository`. Returns the unsubscribe. */
export function subscribeCharacterSaved(repository: Repository, listener: Listener): () => void {
  let set = channels.get(repository);
  if (!set) {
    set = new Set();
    channels.set(repository, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

export function publishCharacterSaved(repository: Repository, character: StoredCharacter): void {
  for (const listener of channels.get(repository) ?? []) listener(character);
}
