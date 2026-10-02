import { DATABASE_NAME, DATABASE_VERSION, RECORD_STORE } from "./types";
import type { ShelfRecord } from "./types";

let connectionPromise: Promise<IDBDatabase> | null = null;
let historyWorks = true;

type SayFn = (message: string, tone?: string) => void;
let say: SayFn = (message) => console.warn(`mmbox: ${message}`);

/** Wired by main.ts once the toast element exists. */
export function bindHistoryToast(notify: SayFn): void {
  say = notify;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!connectionPromise) {
    connectionPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(RECORD_STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return connectionPromise;
}

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withRecords<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const connection = await openDatabase();
  return asPromise(work(connection.transaction(RECORD_STORE, mode).objectStore(RECORD_STORE)));
}

/** History is best-effort: one toast on the first failure, then silence. */
async function guardHistory<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (failure) {
    if (historyWorks) {
      historyWorks = false;
      console.warn("mmbox: local upload history unavailable", failure);
      say("Local history is unavailable", "bad");
    }
    return null;
  }
}

export const saveRecord = (record: ShelfRecord): Promise<unknown> =>
  guardHistory(() => withRecords("readwrite", (store) => store.put(record)));

export const dropRecord = (id: string): Promise<unknown> =>
  guardHistory(() => withRecords("readwrite", (store) => store.delete(id)));

export const allRecords = (): Promise<ShelfRecord[] | null> =>
  guardHistory(() => withRecords("readonly", (store) => store.getAll() as IDBRequest<ShelfRecord[]>));
