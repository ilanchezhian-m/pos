const DB_NAME = 'petpooja-pos';
const DB_VERSION = 1;
const STORES = ['orders', 'bills', 'prints'];

const fallbackMemory = {
  orders: [],
  bills: [],
  prints: [],
};

function hasIndexedDB() {
  return typeof indexedDB !== 'undefined';
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openDatabase();
  if (!db) {
    // fallback to in-memory when IndexedDB is unavailable (e.g., SSR or sandbox)
    return callback(fallbackMemory[storeName], true);
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store, false);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveOrder(order) {
  const record = { ...order, id: order.id || crypto.randomUUID(), synced: false, createdAt: order.createdAt || new Date().toISOString() };
  return withStore('orders', 'readwrite', (store, isMemory) => {
    if (isMemory) {
      fallbackMemory.orders.push(record);
      return record;
    }
    store.put(record);
    return record;
  });
}

export async function saveBill(bill) {
  const record = { ...bill, id: bill.id || crypto.randomUUID(), synced: false, createdAt: bill.createdAt || new Date().toISOString() };
  return withStore('bills', 'readwrite', (store, isMemory) => {
    if (isMemory) {
      fallbackMemory.bills.push(record);
      return record;
    }
    store.put(record);
    return record;
  });
}

export async function savePrintJob(printJob) {
  const record = { ...printJob, id: printJob.id || crypto.randomUUID(), synced: false, createdAt: printJob.createdAt || new Date().toISOString() };
  return withStore('prints', 'readwrite', (store, isMemory) => {
    if (isMemory) {
      fallbackMemory.prints.push(record);
      return record;
    }
    store.put(record);
    return record;
  });
}

export async function updatePrintStatus(id, status) {
  return withStore('prints', 'readwrite', (store, isMemory) => {
    if (isMemory) {
      const idx = fallbackMemory.prints.findIndex((p) => p.id === id)
      if (idx >= 0) fallbackMemory.prints[idx] = { ...fallbackMemory.prints[idx], status }
      return
    }
    const req = store.get(id)
    req.onsuccess = () => {
      const record = req.result
      if (record) {
        store.put({ ...record, status })
      }
    }
  })
}

export async function listOrders() {
  return withStore('orders', 'readonly', (store, isMemory) => {
    if (isMemory) return [...store].sort(sortByDateDesc);
    return getAll(store);
  });
}

export async function listBills() {
  return withStore('bills', 'readonly', (store, isMemory) => {
    if (isMemory) return [...store].sort(sortByDateDesc);
    return getAll(store);
  });
}

export async function listPrintJobs() {
  return withStore('prints', 'readonly', (store, isMemory) => {
    if (isMemory) return [...store].sort(sortByDateDesc);
    return getAll(store);
  });
}

export async function markSynced(storeName, id) {
  return withStore(storeName, 'readwrite', (store, isMemory) => {
    if (isMemory) {
      const collection = fallbackMemory[storeName];
      const idx = collection.findIndex((r) => r.id === id);
      if (idx >= 0) collection[idx] = { ...collection[idx], synced: true };
      return;
    }
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result;
      if (record) {
        store.put({ ...record, synced: true });
      }
    };
  });
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.sort(sortByDateDesc));
    request.onerror = () => reject(request.error);
  });
}

function sortByDateDesc(a, b) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export async function clearAll() {
  await withStore('orders', 'readwrite', (store, isMemory) => {
    if (isMemory) fallbackMemory.orders = [];
    else store.clear();
  });
  await withStore('bills', 'readwrite', (store, isMemory) => {
    if (isMemory) fallbackMemory.bills = [];
    else store.clear();
  });
  await withStore('prints', 'readwrite', (store, isMemory) => {
    if (isMemory) fallbackMemory.prints = [];
    else store.clear();
  });
}
