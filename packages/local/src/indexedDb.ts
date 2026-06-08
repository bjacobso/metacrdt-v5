import type { AsyncLocalRuntimeStorage } from "./async.js";

export type IndexedDbStorageOptions = {
  dbName?: string;
  storeName?: string;
  version?: number;
  indexedDB?: IDBFactory;
};

type RequestWithResult<T> = IDBRequest<T>;

function request<T>(req: RequestWithResult<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function openDb(options: Required<IndexedDbStorageOptions>): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = options.indexedDB.open(options.dbName, options.version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(options.storeName)) {
        db.createObjectStore(options.storeName);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export class IndexedDbRuntimeStorage implements AsyncLocalRuntimeStorage {
  private constructor(
    private readonly db: IDBDatabase,
    private readonly storeName: string,
  ) {}

  static async open(
    options: IndexedDbStorageOptions = {},
  ): Promise<IndexedDbRuntimeStorage> {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (factory === undefined) {
      throw new Error(
        "@metacrdt/local requires indexedDB; pass `indexedDB` or `storage` in non-browser hosts",
      );
    }
    const full = {
      dbName: options.dbName ?? "metacrdt",
      storeName: options.storeName ?? "kv",
      version: options.version ?? 1,
      indexedDB: factory,
    };
    return new IndexedDbRuntimeStorage(await openDb(full), full.storeName);
  }

  async getItem(key: string): Promise<string | null> {
    const tx = this.db.transaction(this.storeName, "readonly");
    const done = txDone(tx);
    const value = await request<unknown>(tx.objectStore(this.storeName).get(key));
    await done;
    return typeof value === "string" ? value : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const tx = this.db.transaction(this.storeName, "readwrite");
    const done = txDone(tx);
    await request(tx.objectStore(this.storeName).put(value, key));
    await done;
  }

  async removeItem(key: string): Promise<void> {
    const tx = this.db.transaction(this.storeName, "readwrite");
    const done = txDone(tx);
    await request(tx.objectStore(this.storeName).delete(key));
    await done;
  }

  close(): void {
    this.db.close();
  }
}

export function indexedDbStorage(
  options: IndexedDbStorageOptions = {},
): Promise<IndexedDbRuntimeStorage> {
  return IndexedDbRuntimeStorage.open(options);
}
