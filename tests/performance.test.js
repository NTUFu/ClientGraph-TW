import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openDB, upsertRecords, getMetadata } from '../src/utils/db.js';

describe('Performance and Scalability Tests', () => {
  let db;
  const DB_NAME = 'PerfTestDB';
  const RECORD_COUNT = 5000;

  // Generate dummy data
  const generateDummyRecords = (count) => {
    const records = [];
    for (let i = 0; i < count; i++) {
      records.push({
        edgeKey: `edge_${i}`,
        personNodeKey: `person_${i}`,
        normalizedSearch: `search_term_${i} company_name_${i} title_${i}`,
        sourceType: 'perf_test',
        資料年月: '11504',
        姓名: `姓名_${i}`,
        公司代號: `CODE_${i}`,
        公司名稱: `公司_${i}`,
        職稱: `職稱_${i}`,
        目前持股: '100'
      });
    }
    return records;
  };

  beforeAll(async () => {
    db = await openDB(DB_NAME, 1);
  });

  afterAll(async () => {
    if (db) db.close();
    const idb = globalThis.indexedDB;
    if (idb) {
      await new Promise((resolve) => {
        const req = idb.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    }
  });

  it(`should efficiently upsert ${RECORD_COUNT} records using chunked transactions`, async () => {
    const records = generateDummyRecords(RECORD_COUNT);

    const start = performance.now();
    const stats = await upsertRecords(db, records, 500);
    const end = performance.now();
    const duration = end - start;

    console.log(`Upserted ${RECORD_COUNT} records in ${duration.toFixed(2)}ms`);

    // Verify statistics
    expect(stats.inserted).toBe(RECORD_COUNT);
    expect(stats.updated).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(stats.errors).toBe(0);

    // Verify duration (loose threshold for CI/testing environments, but should be fast)
    // 5000 records should easily pass under 3 seconds in most environments
    expect(duration).toBeLessThan(3000);

    // Verify data integrity in DB
    const tx = db.transaction(['relationships'], 'readonly');
    const store = tx.objectStore('relationships');
    const countReq = store.count();
    const count = await new Promise((resolve) => {
      countReq.onsuccess = () => resolve(countReq.result);
    });
    expect(count).toBe(RECORD_COUNT);

    // Verify metadata
    const meta = await getMetadata(db);
    expect(meta.importCount).toBe(1);
    expect(meta.sourceSummary['perf_test']).toBe(RECORD_COUNT);
  });

  it('should handle duplicate imports correctly with chunking', async () => {
    const records = generateDummyRecords(1000);

    // First import
    await upsertRecords(db, records, 500);

    // Second import (duplicates)
    const start = performance.now();
    const stats = await upsertRecords(db, records, 500);
    const end = performance.now();
    const duration = end - start;

    console.log(`Duplicate upsert of 1000 records took ${duration.toFixed(2)}ms`);

    // Verify stats
    expect(stats.inserted).toBe(0);
    expect(stats.skipped).toBe(1000);
    expect(stats.updated).toBe(0);
    expect(stats.errors).toBe(0);
    
    // Duration should be very low for skips
    expect(duration).toBeLessThan(1000);
  });
});
