/**
 * Raw native IndexedDB utility functions.
 * Adheres strictly to the guidelines of avoiding third-party wrappers and prohibiting store.clear().
 */

/**
 * Compares two records to check if any business fields differ.
 * 
 * @param {Object} a - Existing record in DB.
 * @param {Object} b - Incoming record.
 * @returns {boolean} True if they differ.
 */
export function areRecordsDifferent(a, b) {
  const fieldsToCompare = [
    '出表日期',
    '資料年月',
    '公司名稱',
    '選任時持股',
    '目前持股',
    '設質股數',
    '設質股數佔持股比例',
    '內部人關係人目前持股合計',
    '內部人關係人設質股數',
    '內部人關係人設質比例',
    'isPrincipal',
    'isRepresentative',
    'representedBy',
    'representativeFor',
    'personNodeKey',
    'normalizedSearch',
    'sourceType'
  ];
  return fieldsToCompare.some(field => a[field] !== b[field]);
}

/**
 * Opens the native IndexedDB database.
 * 
 * @param {string} dbName - Database name (defaults to 'ClientGraphTW').
 * @param {number} version - Database version.
 * @returns {Promise<IDBDatabase>} Opened DB instance.
 */
export function openDB(dbName = 'ClientGraphTW', version = 1) {
  return new Promise((resolve, reject) => {
    // Check if running in a support environment (Node tests without window/self)
    const idb = typeof indexedDB !== 'undefined' ? indexedDB : (typeof globalThis !== 'undefined' ? globalThis.indexedDB : null);
    if (!idb) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }
    
    const request = idb.open(dbName, version);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // relationships store
      if (!db.objectStoreNames.contains('relationships')) {
        const relStore = db.createObjectStore('relationships', { keyPath: 'edgeKey' });
        
        // Loop 3 search indexes
        relStore.createIndex('companyCode', '公司代號', { unique: false });
        relStore.createIndex('name', '姓名', { unique: false });
        relStore.createIndex('title', '職稱', { unique: false });
        relStore.createIndex('dataYearMonth', '資料年月', { unique: false });
        relStore.createIndex('sourceType', 'sourceType', { unique: false });
        relStore.createIndex('normalizedSearch', 'normalizedSearch', { unique: false });
      }
      
      // metadata store
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    
    request.onerror = (event) => {
      reject(event.target.error || new Error('Failed to open database.'));
    };
  });
}

/**
 * Fetches the global metadata record from IndexedDB.
 * 
 * @param {IDBDatabase} db - Opened DB instance.
 * @returns {Promise<Object|null>} Metadata object or null if not found.
 */
export function getMetadata(db) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['metadata'], 'readonly');
      const store = tx.objectStore('metadata');
      const request = store.get('global');
      
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      
      request.onerror = () => {
        reject(request.error || new Error('Failed to fetch metadata.'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Upserts a list of standardized records transactionally.
 * Tracks insertion, update, and skip statistics and updates global metadata safely.
 * 
 * @param {IDBDatabase} db - Opened DB instance.
 * @param {Array<Object>} records - Standardized record list to upsert.
 * @returns {Promise<{ inserted: number, updated: number, skipped: number, errors: number }>} Upsert statistics.
 */
export function upsertRecords(db, records) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(records) || records.length === 0) {
      resolve({ inserted: 0, updated: 0, skipped: 0, errors: 0 });
      return;
    }
    
    let tx;
    try {
      tx = db.transaction(['relationships', 'metadata'], 'readwrite');
    } catch (err) {
      reject(err);
      return;
    }
    
    const relStore = tx.objectStore('relationships');
    const metaStore = tx.objectStore('metadata');
    
    const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
    let currentMetadata = null;
    
    // Fetch current metadata record first
    const metaReq = metaStore.get('global');
    
    metaReq.onsuccess = () => {
      currentMetadata = metaReq.result || {
        key: 'global',
        latestDataMonth: '',
        sourceTypes: [],
        sourceSummary: {},
        importCount: 0
      };
      
      // Process records sequentially
      processRecords(records, 0);
    };
    
    metaReq.onerror = () => {
      tx.abort();
      reject(metaReq.error || new Error('Failed to fetch metadata during transaction.'));
    };
    
    function processRecords(recordsList, index) {
      if (index >= recordsList.length) {
        // Complete transaction: Increment importCount and update metadata
        if (stats.inserted > 0 || stats.updated > 0) {
          currentMetadata.importCount += 1;
        }
        
        const saveMetaReq = metaStore.put(currentMetadata);
        saveMetaReq.onerror = () => {
          tx.abort();
          reject(saveMetaReq.error || new Error('Failed to save updated metadata.'));
        };
        return;
      }
      
      const record = recordsList[index];
      const getReq = relStore.get(record.edgeKey);
      
      getReq.onsuccess = () => {
        const existing = getReq.result;
        
        if (!existing) {
          // INSERT
          const putReq = relStore.put(record);
          putReq.onsuccess = () => {
            stats.inserted++;
            updateMetadataAccumulator(record, true, null);
            processRecords(recordsList, index + 1);
          };
          putReq.onerror = () => {
            stats.errors++;
            processRecords(recordsList, index + 1);
          };
        } else {
          // Check for differences
          if (areRecordsDifferent(existing, record)) {
            // UPDATE
            const putReq = relStore.put(record);
            putReq.onsuccess = () => {
              stats.updated++;
              updateMetadataAccumulator(record, false, existing.sourceType);
              processRecords(recordsList, index + 1);
            };
            putReq.onerror = () => {
              stats.errors++;
              processRecords(recordsList, index + 1);
            };
          } else {
            // SKIP
            stats.skipped++;
            processRecords(recordsList, index + 1);
          }
        }
      };
      
      getReq.onerror = () => {
        stats.errors++;
        processRecords(recordsList, index + 1);
      };
    }
    
    function updateMetadataAccumulator(record, isInsert, oldSourceType) {
      // 1. Update latestDataMonth
      if (record.資料年月) {
        const recordMonth = parseInt(record.資料年月, 10);
        const currentMonth = currentMetadata.latestDataMonth ? parseInt(currentMetadata.latestDataMonth, 10) : 0;
        if (recordMonth > currentMonth) {
          currentMetadata.latestDataMonth = record.資料年月;
        }
      }
      
      // 2. Accumulate sourceTypes
      if (record.sourceType && !currentMetadata.sourceTypes.includes(record.sourceType)) {
        currentMetadata.sourceTypes.push(record.sourceType);
      }
      
      // 3. Update sourceSummary counts
      if (record.sourceType) {
        if (isInsert) {
          if (!currentMetadata.sourceSummary[record.sourceType]) {
            currentMetadata.sourceSummary[record.sourceType] = 0;
          }
          currentMetadata.sourceSummary[record.sourceType]++;
        } else if (oldSourceType && oldSourceType !== record.sourceType) {
          // Decrement old source count
          if (currentMetadata.sourceSummary[oldSourceType]) {
            currentMetadata.sourceSummary[oldSourceType]--;
            if (currentMetadata.sourceSummary[oldSourceType] < 0) {
              currentMetadata.sourceSummary[oldSourceType] = 0;
            }
          }
          // Increment new source count
          if (!currentMetadata.sourceSummary[record.sourceType]) {
            currentMetadata.sourceSummary[record.sourceType] = 0;
          }
          currentMetadata.sourceSummary[record.sourceType]++;
        }
      }
    }
    
    tx.oncomplete = () => {
      resolve(stats);
    };
    
    tx.onerror = (event) => {
      reject(tx.error || event.target.error || new Error('Transaction failed.'));
    };
  });
}
