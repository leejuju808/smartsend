// Block 42000 — SmartSend Roofing Crew App v1
// Offline Storage: IndexedDB wrapper for offline-first functionality
// lib/offline-storage.ts

interface QueuedAction {
  id: string;
  type: 'photo' | 'material' | 'activity' | 'punch_list' | 'change_order';
  endpoint: string;
  method: string;
  payload: any;
  timestamp: number;
  retries: number;
}

class OfflineStorage {
  private dbName = 'smartsend_crew_offline';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Queued actions store
        if (!db.objectStoreNames.contains('queued_actions')) {
          const actionStore = db.createObjectStore('queued_actions', {
            keyPath: 'id',
            autoIncrement: true,
          });
          actionStore.createIndex('timestamp', 'timestamp', { unique: false });
          actionStore.createIndex('type', 'type', { unique: false });
        }

        // Photos cache store
        if (!db.objectStoreNames.contains('photo_cache')) {
          const photoStore = db.createObjectStore('photo_cache', {
            keyPath: 'id',
            autoIncrement: true,
          });
          photoStore.createIndex('job_id', 'job_id', { unique: false });
          photoStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Activity cache store
        if (!db.objectStoreNames.contains('activity_cache')) {
          const activityStore = db.createObjectStore('activity_cache', {
            keyPath: 'id',
            autoIncrement: true,
          });
          activityStore.createIndex('job_id', 'job_id', { unique: false });
        }
      };
    });
  }

  async queueAction(action: Omit<QueuedAction, 'id' | 'timestamp' | 'retries'>): Promise<string> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['queued_actions'], 'readwrite');
      const store = transaction.objectStore('queued_actions');

      const queuedAction: QueuedAction = {
        ...action,
        id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        timestamp: Date.now(),
        retries: 0,
      };

      const request = store.add(queuedAction);

      request.onsuccess = () => resolve(queuedAction.id);
      request.onerror = () => reject(request.error);
    });
  }

  async getQueuedActions(): Promise<QueuedAction[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['queued_actions'], 'readonly');
      const store = transaction.objectStore('queued_actions');
      const index = store.index('timestamp');
      const request = index.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async removeQueuedAction(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['queued_actions'], 'readwrite');
      const store = transaction.objectStore('queued_actions');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async incrementRetry(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['queued_actions'], 'readwrite');
      const store = transaction.objectStore('queued_actions');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const action = getRequest.result;
        if (action) {
          action.retries += 1;
          const putRequest = store.put(action);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async cachePhoto(photo: {
    job_id: string;
    category: string;
    file: File;
    member_id: string;
  }): Promise<string> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const transaction = this.db!.transaction(['photo_cache'], 'readwrite');
        const store = transaction.objectStore('photo_cache');

        const cachedPhoto = {
          job_id: photo.job_id,
          category: photo.category,
          member_id: photo.member_id,
          file_data: e.target?.result,
          file_name: photo.file.name,
          file_type: photo.file.type,
          timestamp: Date.now(),
        };

        const request = store.add(cachedPhoto);
        request.onsuccess = () => resolve(request.result as string);
        request.onerror = () => reject(request.error);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(photo.file);
    });
  }

  async getCachedPhotos(job_id: string): Promise<any[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['photo_cache'], 'readonly');
      const store = transaction.objectStore('photo_cache');
      const index = store.index('job_id');
      const request = index.getAll(job_id);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async removeCachedPhoto(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['photo_cache'], 'readwrite');
      const store = transaction.objectStore('photo_cache');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async isOnline(): Promise<boolean> {
    return navigator.onLine;
  }
}

export const offlineStorage = new OfflineStorage();

// Sync queued actions when online
export async function syncQueuedActions(): Promise<void> {
  const isOnline = await offlineStorage.isOnline();
  if (!isOnline) return;

  const actions = await offlineStorage.getQueuedActions();

  for (const action of actions) {
    try {
      let response: Response;

      if (action.type === 'photo') {
        // Handle photo upload with FormData
        const formData = new FormData();
        Object.keys(action.payload).forEach((key) => {
          if (key === 'file' && action.payload[key] instanceof File) {
            formData.append(key, action.payload[key]);
          } else {
            formData.append(key, action.payload[key]);
          }
        });

        response = await fetch(action.endpoint, {
          method: action.method,
          body: formData,
        });
      } else {
        response = await fetch(action.endpoint, {
          method: action.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.payload),
        });
      }

      if (response.ok) {
        await offlineStorage.removeQueuedAction(action.id);
        console.log(`Synced action ${action.id}`);
      } else {
        // Increment retry count
        await offlineStorage.incrementRetry(action.id);
        
        // Remove if too many retries
        if (action.retries >= 5) {
          await offlineStorage.removeQueuedAction(action.id);
          console.error(`Failed to sync action ${action.id} after 5 retries`);
        }
      }
    } catch (error) {
      console.error(`Error syncing action ${action.id}:`, error);
      await offlineStorage.incrementRetry(action.id);
    }
  }
}

// Initialize sync on page load and when coming back online
if (typeof window !== 'undefined') {
  offlineStorage.init().then(() => {
    // Sync on load
    syncQueuedActions();

    // Sync when coming back online
    window.addEventListener('online', () => {
      syncQueuedActions();
    });

    // Periodic sync (every 30 seconds)
    setInterval(syncQueuedActions, 30000);
  });
}































