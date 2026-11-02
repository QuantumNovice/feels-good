import { applyLocal, type Spot, type State } from '../state';

/** Write personal data before acknowledging a change. Remote records stay in IndexedDB. */
export function persistPersonalChange(
  storage: Pick<Storage, 'setItem'>,
  snapshot: State,
  curated: Iterable<Spot>,
  action: string,
  payload: unknown,
) {
  const personal: State = {
    spots: Array.from(curated),
    saved: [...snapshot.saved],
    notes: { ...snapshot.notes },
    url: '',
    synced: '',
  };
  applyLocal(personal, action, payload);
  // A quota/access error propagates before the live snapshot is changed.
  storage.setItem('preview', JSON.stringify(personal));
}
