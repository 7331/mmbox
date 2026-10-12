// The device's upload shelf in IndexedDB (database "mmbox", store "uploads", keyed by id). Best effort: the first
// failure is reported once through `onFirstHistoryFailure`, then the page carries on without history.
import type { ShelfRecord } from "@/lib/media_upload_types"

const databaseName = "mmbox"
const recordStoreName = "uploads"
const databaseVersion = 1

let databaseConnectionPromise: Promise<IDBDatabase> | null = null
let historyStillWorks = true
let reportFirstHistoryFailure: () => void = () => undefined

export function setFirstHistoryFailureReporter(onFirstHistoryFailure: () => void): void {
  reportFirstHistoryFailure = onFirstHistoryFailure
}

function openUploadDatabase(): Promise<IDBDatabase> {
  databaseConnectionPromise ??= new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(databaseName, databaseVersion)
    openRequest.onupgradeneeded = () => openRequest.result.createObjectStore(recordStoreName, { keyPath: "id" })
    openRequest.onsuccess = () => resolve(openRequest.result)
    openRequest.onerror = () => reject(openRequest.error)
  })
  return databaseConnectionPromise
}

function waitForDatabaseRequest<Result>(databaseRequest: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    databaseRequest.onsuccess = () => resolve(databaseRequest.result)
    databaseRequest.onerror = () => reject(databaseRequest.error)
  })
}

async function runOnRecordStore<Result>(
  transactionMode: IDBTransactionMode,
  storeWork: (recordStore: IDBObjectStore) => IDBRequest<Result>,
): Promise<Result | null> {
  try {
    const databaseConnection = await openUploadDatabase()
    return await waitForDatabaseRequest(storeWork(databaseConnection.transaction(recordStoreName, transactionMode).objectStore(recordStoreName)))
  } catch (historyFailure) {
    if (historyStillWorks) {
      historyStillWorks = false
      console.warn("mmbox: local upload history unavailable", historyFailure)
      reportFirstHistoryFailure()
    }
    return null
  }
}

export const saveShelfRecord = (shelfRecord: ShelfRecord): Promise<unknown> =>
  runOnRecordStore("readwrite", (recordStore) => recordStore.put(shelfRecord))

export const deleteShelfRecord = (recordId: string): Promise<unknown> =>
  runOnRecordStore("readwrite", (recordStore) => recordStore.delete(recordId))

export const readAllShelfRecords = (): Promise<ShelfRecord[] | null> =>
  runOnRecordStore("readonly", (recordStore) => recordStore.getAll() as IDBRequest<ShelfRecord[]>)
