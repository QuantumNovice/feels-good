import type { Spot } from '../state';
export type CachedSource = {
  url: string;
  spots: Spot[];
  synced: string;
  checkedAt: number;
  etag: string;
  modified: string;
};
export interface SourceStore {
  read(): Promise<CachedSource | undefined>;
  write(snapshot: CachedSource): Promise<void>;
  clear(): Promise<void>;
}

/** IndexedDB keeps remote records out of the small personal-curation localStorage entry. */
export class BrowserSourceStore implements SourceStore {
  private database?: Promise<IDBDatabase>;
  private open() {
    return (this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neujoh-sources', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('snapshots');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  }
  async read() {
    const database = await this.open();
    return new Promise<CachedSource | undefined>((resolve, reject) => {
      const request = database
        .transaction('snapshots')
        .objectStore('snapshots')
        .get('active');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  private async mutate(value?: CachedSource) {
    const database = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('snapshots', 'readwrite');
      const store = transaction.objectStore('snapshots');
      if (value) store.put(value, 'active');
      else store.delete('active');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  write(value: CachedSource) {
    return this.mutate(value);
  }
  clear() {
    return this.mutate();
  }
}
