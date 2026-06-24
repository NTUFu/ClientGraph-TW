/**
 * Raw native IndexedDB utility functions.
 * Adheres strictly to the guidelines of avoiding third-party wrappers and prohibiting store.clear().
 */

import { normalize } from './keys.js';

const DB_NAME = 'ClientGraphTW';
const activeConnections = new Set();

function closeActiveConnections(extraDb = null) {
  if (extraDb) {
    activeConnections.add(extraDb);
  }

  for (const connection of activeConnections) {
    try {
      connection.close();
    } catch (err) {
      // Ignore close errors during teardown.
    }
  }

  activeConnections.clear();
}

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
export function openDB(dbName = DB_NAME, version = 1) {
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
      const db = event.target.result;

      // Auto-close stale connections when a version change happens.
      db.onversionchange = () => {
        activeConnections.delete(db);
        db.close();
      };

      activeConnections.add(db);
      resolve(db);
    };
    
    request.onerror = (event) => {
      reject(event.target.error || new Error('Failed to open database.'));
    };
  });
}

/**
 * Retrieves all records from the relationships store.
 * 
 * @param {IDBDatabase} db - Opened DB instance.
 * @returns {Promise<Array<Object>>} Array of all records.
 */
export function getAllRecords(db) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['relationships'], 'readonly');
      const store = tx.objectStore('relationships');
      const request = store.getAll();
      
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      
      request.onerror = () => {
        reject(request.error || new Error('Failed to fetch all records.'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieves records from relationships store with an upper limit using cursor.
 * This helps keep UI responsive when total records are very large.
 *
 * @param {IDBDatabase} db - Opened DB instance.
 * @param {number} limit - Max number of records to read.
 * @returns {Promise<Array<Object>>} Array of records up to limit.
 */
export function getRecordsWithLimit(db, limit = 3000) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['relationships'], 'readonly');
      const store = tx.objectStore('relationships');
      const request = store.openCursor();
      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }

        results.push(cursor.value);
        cursor.continue();
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to fetch records with limit.'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Returns total number of relationship records.
 *
 * @param {IDBDatabase} db - Opened DB instance.
 * @returns {Promise<number>} Total record count.
 */
export function getRelationshipsCount(db) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['relationships'], 'readonly');
      const store = tx.objectStore('relationships');
      const request = store.count();

      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error || new Error('Failed to count relationships.'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieves records by keyword from relationships store with an upper limit.
 * Uses cursor scan with early stop to avoid loading full dataset into memory.
 *
 * @param {IDBDatabase} db - Opened DB instance.
 * @param {string} keyword - Search keyword.
 * @param {number} limit - Max number of records to read.
 * @returns {Promise<Array<Object>>} Matched records up to limit.
 */
export function getRecordsByKeyword(db, keyword, limit = 3000) {
  return new Promise((resolve, reject) => {
    try {
      const normalizedKeyword = normalize(keyword).toLowerCase();
      if (!normalizedKeyword) {
        resolve([]);
        return;
      }

      const tx = db.transaction(['relationships'], 'readonly');
      const store = tx.objectStore('relationships');
      const request = store.openCursor();
      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }

        const record = cursor.value;
        const searchableText = normalize(
          record.normalizedSearch || `${record.姓名 || ''} ${record.公司代號 || ''} ${record.公司名稱 || ''} ${record.職稱 || ''}`
        ).toLowerCase();

        if (searchableText.includes(normalizedKeyword)) {
          results.push(record);
        }

        cursor.continue();
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to fetch records by keyword.'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieves records by exact person names with an upper limit.
 * Useful for one-hop expansion: from matched managers to their roles in other companies.
 *
 * @param {IDBDatabase} db - Opened DB instance.
 * @param {Array<string>} names - Person names to query.
 * @param {number} limit - Max number of records to return.
 * @returns {Promise<Array<Object>>} Matched records up to limit.
 */
export async function getRecordsByNames(db, names, limit = 2000) {
  const normalizedNames = Array.from(
    new Set((Array.isArray(names) ? names : []).map(name => normalize(name)).filter(Boolean))
  );

  if (normalizedNames.length === 0 || limit <= 0) {
    return [];
  }

  const allResults = [];
  const seenEdgeKeys = new Set();

  for (const name of normalizedNames) {
    if (allResults.length >= limit) {
      break;
    }

    // Keep each name query in a short-lived readonly transaction.
    const resultsForName = await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(['relationships'], 'readonly');
        const store = tx.objectStore('relationships');
        const nameIndex = store.index('name');
        const request = nameIndex.openCursor(IDBKeyRange.only(name));
        const results = [];

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (!cursor || allResults.length + results.length >= limit) {
            resolve(results);
            return;
          }

          const record = cursor.value;
          if (record?.edgeKey && !seenEdgeKeys.has(record.edgeKey)) {
            results.push(record);
          }

          cursor.continue();
        };

        request.onerror = () => {
          reject(request.error || new Error('Failed to fetch records by names.'));
        };
      } catch (err) {
        reject(err);
      }
    });

    for (const record of resultsForName) {
      if (!record?.edgeKey || seenEdgeKeys.has(record.edgeKey)) {
        continue;
      }

      seenEdgeKeys.add(record.edgeKey);
      allResults.push(record);
      if (allResults.length >= limit) {
        break;
      }
    }
  }

  return allResults;
}

/**
 * Retrieves the global metadata record from the metadata store.
 * 
 * @param {IDBDatabase} db - Opened DB instance.
 * @returns {Promise<Object|null>} The metadata object or null if not found.
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
 * Internal helper to update metadata accumulator.
 */
function updateMetadataAccumulator(record, isInsert, oldSourceType, currentMetadata) {
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

/**
 * Helper to convert IDBRequest to a Promise.
 */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Internal helper to upsert a single chunk.
 * 
 * @param {IDBDatabase} db - Opened DB instance.
 * @param {Array<Object>} chunk - Array of records.
 * @param {Object} currentMetadata - The metadata object to update in-memory.
 * @returns {Promise<Object>} Chunk statistics.
 */
async function _upsertChunk(db, chunk, currentMetadata) {
  const tx = db.transaction(['relationships'], 'readwrite');
  const relStore = tx.objectStore('relationships');
  const stats = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [] // New: store detailed error information
  };

  // Track transaction completion
  let txCompleted = false;
  let txError = null;

  const txPromise = new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      txCompleted = true;
      resolve();
    };
    tx.onerror = () => {
      txError = tx.error;
      reject(tx.error);
    };
  });

  try {
    for (let recordIndex = 0; recordIndex < chunk.length; recordIndex++) {
      const record = chunk[recordIndex];
      try {
        if (!record || !record.edgeKey) {
          stats.errors++;
          stats.errorDetails.push({
            recordIndex,
            edgeKey: record?.edgeKey || 'N/A',
            reason: 'Invalid record: missing edgeKey'
          });
          continue;
        }

        const existing = await promisifyRequest(relStore.get(record.edgeKey));
        if (!existing) {
          await promisifyRequest(relStore.put(record));
          stats.inserted++;
          updateMetadataAccumulator(record, true, null, currentMetadata);
        } else if (areRecordsDifferent(existing, record)) {
          await promisifyRequest(relStore.put(record));
          stats.updated++;
          updateMetadataAccumulator(record, false, existing.sourceType, currentMetadata);
        } else {
          stats.skipped++;
        }
      } catch (err) {
        stats.errors++;
        stats.errorDetails.push({
          recordIndex,
          edgeKey: record?.edgeKey || 'N/A',
          reason: err?.message || 'Unknown error during upsert'
        });
      }
    }
    
    // Wait for the transaction to complete
    await txPromise;
  } catch (err) {
    // Transaction failed; provide detailed context
    const error = new Error(`Transaction failed during chunk upsert: ${err?.message || 'Unknown error'}`);
    error.originalError = err;
    error.stats = stats;
    throw error;
  }

  return stats;
}

/**
 * Upserts records from an iterable in multiple chunks to avoid UI thread blocking.
 * 
 * @param {IDBDatabase} db - Opened DB instance.
 * @param {Iterable<Object>} records - An iterable of standardized record objects.
 * @param {number} chunkSize - Number of records per transaction (default: 500).
 * @param {Function} [onChunkComplete] - Optional callback for progress updates.
 *        callback shape: (chunkIndex, totalChunks, chunkStats) => void.
 * @returns {Promise<{ inserted: number, updated: number, skipped: number, errors: number }>} Upsert statistics.
 */
export async function upsertRecords(db, records, chunkSize = 500, onChunkComplete = null) {
  if (!records || (typeof records[Symbol.iterator] !== 'function' && !Array.isArray(records))) {
    return { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  }

  const totalStats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
  let currentMetadata = await getMetadata(db);
  if (!currentMetadata) {
    currentMetadata = {
      key: 'global',
      latestDataMonth: '',
      sourceTypes: [],
      sourceSummary: {},
      importCount: 0
    };
  }

  // Note: Since we are using an Iterable, we don't know the total count in advance.
  // We will pass -1 or omit totalChunks if not known, or use a heuristic.
  // For the purpose of progress, we'll treat it as unknown.
  let chunkIndex = 0;

  let currentChunk = [];

  try {
    for (const record of records) {
      currentChunk.push(record);

      if (currentChunk.length === chunkSize) {
        const chunkStats = await _upsertChunk(db, currentChunk, currentMetadata);
        
        totalStats.inserted += chunkStats.inserted;
        totalStats.updated += chunkStats.updated;
        totalStats.skipped += chunkStats.skipped;
        totalStats.errors += chunkStats.errors;

        if (typeof onChunkComplete === 'function') {
          onChunkComplete(++chunkIndex, -1, chunkStats);
        }
        currentChunk = [];
      }
    }

    // Process the last remaining chunk
    if (currentChunk.length > 0) {
      const chunkStats = await _upsertChunk(db, currentChunk, currentMetadata);
      totalStats.inserted += chunkStats.inserted;
      totalStats.updated += chunkStats.updated;
      totalStats.skipped += chunkStats.skipped;
      totalStats.errors += chunkStats.errors;

      if (typeof onChunkComplete === 'function') {
        onChunkComplete(++chunkIndex, -1, chunkStats);
      }
    }
  } catch (err) {
    throw err;
  }

  // Final metadata update
  if (totalStats.inserted > 0 || totalStats.updated > 0) {
    currentMetadata.importCount += 1;
    const tx = db.transaction(['metadata'], 'readwrite');
    const metaStore = tx.objectStore('metadata');
    await new Promise((resolve, reject) => {
      const req = metaStore.put(currentMetadata);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  return totalStats;
}

/**
 * Clears all data from IndexedDB (relationships and metadata stores).
 * Uses deleteDatabase to fully remove the database and reclaim storage.
 * 
 * @param {IDBDatabase} db - Opened DB instance.
 * @returns {Promise<void>}
 */
export function clearDatabase(db) {
  return new Promise((resolve, reject) => {
    try {
      // Close all known open connections before deleting DB.
      closeActiveConnections(db);
      
      // Delete the entire database to reclaim storage space
      const idb = typeof indexedDB !== 'undefined' ? indexedDB : (typeof globalThis !== 'undefined' ? globalThis.indexedDB : null);
      if (!idb) {
        reject(new Error('IndexedDB is not supported in this environment.'));
        return;
      }
      
      const deleteRequest = idb.deleteDatabase(DB_NAME);
      
      deleteRequest.onsuccess = () => {
        resolve();
      };
      
      deleteRequest.onerror = () => {
        reject(deleteRequest.error || new Error('Failed to delete database'));
      };
      
      deleteRequest.onblocked = () => {
        reject(new Error('Delete database blocked by another open tab or connection.'));
      };
    } catch (err) {
      reject(err);
    }
  });
}
