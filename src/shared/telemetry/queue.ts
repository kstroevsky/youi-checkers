import type { TelemetryBatch } from '@/shared/telemetry/contracts';

const DATABASE_NAME = 'youi-telemetry';
const DATABASE_VERSION = 1;
const STORE_NAME = 'pendingBatches';

export const MAX_QUEUED_BATCHES = 10;
export const MAX_QUEUED_BYTES = 256 * 1024;

type QueueRecord = {
  batch: TelemetryBatch;
  batchId: string;
  createdAt: number;
  size: number;
};

export type TelemetryQueue = {
  clear: () => Promise<void>;
  enqueue: (batch: TelemetryBatch) => Promise<void>;
  list: () => Promise<TelemetryBatch[]>;
  remove: (batchId: string) => Promise<void>;
};

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Telemetry IndexedDB request failed.'));
  });
}

function deleteDatabase(factory: IDBFactory): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(DATABASE_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        request.error ?? new Error('Failed to delete telemetry IndexedDB.'),
      );
    request.onblocked = () =>
      reject(new Error('Telemetry IndexedDB deletion was blocked.'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error('Telemetry IndexedDB transaction failed.'),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error('Telemetry IndexedDB transaction aborted.'),
      );
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'batchId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open telemetry IndexedDB.'));
  });
}

async function withStore<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase(factory);

  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const completed = transactionToPromise(transaction);
    const result = await run(transaction.objectStore(STORE_NAME));
    await completed;
    return result;
  } finally {
    database.close();
  }
}

function serializedSize(batch: TelemetryBatch): number {
  return new TextEncoder().encode(JSON.stringify(batch)).byteLength;
}

export function createTelemetryQueue(factory: IDBFactory): TelemetryQueue {
  return {
    clear: () => deleteDatabase(factory),
    enqueue: (batch) =>
      withStore(factory, 'readwrite', async (store) => {
        const record: QueueRecord = {
          batch,
          batchId: batch.batchId,
          createdAt: Date.now(),
          size: serializedSize(batch),
        };
        await requestToPromise(store.put(record));

        const records = (await requestToPromise(
          store.getAll(),
        )) as QueueRecord[];
        records.sort(
          (left, right) =>
            left.createdAt - right.createdAt ||
            left.batchId.localeCompare(right.batchId),
        );
        let totalBytes = records.reduce(
          (total, entry) => total + entry.size,
          0,
        );

        while (
          records.length > MAX_QUEUED_BATCHES ||
          totalBytes > MAX_QUEUED_BYTES
        ) {
          const oldest = records.shift();

          if (!oldest) {
            break;
          }

          totalBytes -= oldest.size;
          await requestToPromise(store.delete(oldest.batchId));
        }
      }),
    list: () =>
      withStore(factory, 'readonly', async (store) => {
        const records = (await requestToPromise(
          store.getAll(),
        )) as QueueRecord[];

        return records
          .sort(
            (left, right) =>
              left.createdAt - right.createdAt ||
              left.batchId.localeCompare(right.batchId),
          )
          .map(({ batch }) => batch);
      }),
    remove: (batchId) =>
      withStore(factory, 'readwrite', async (store) => {
        await requestToPromise(store.delete(batchId));
      }),
  };
}

export function createBrowserTelemetryQueue(): TelemetryQueue | null {
  return typeof indexedDB === 'undefined'
    ? null
    : createTelemetryQueue(indexedDB);
}

export function createMemoryTelemetryQueue(): TelemetryQueue {
  const batches: TelemetryBatch[] = [];

  return {
    async clear() {
      batches.length = 0;
    },
    async enqueue(batch) {
      const existingIndex = batches.findIndex(
        ({ batchId }) => batchId === batch.batchId,
      );

      if (existingIndex >= 0) {
        batches[existingIndex] = batch;
      } else {
        batches.push(batch);
      }

      while (batches.length > MAX_QUEUED_BATCHES) {
        batches.shift();
      }
    },
    async list() {
      return batches.slice();
    },
    async remove(batchId) {
      const index = batches.findIndex((batch) => batch.batchId === batchId);

      if (index >= 0) {
        batches.splice(index, 1);
      }
    },
  };
}
