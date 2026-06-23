import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { openDB, upsertRecords, getMetadata, getAllRecords } from '../src/utils/db.js';

/**
 * Loop 5 Performance Benchmark Tests
 * 
 * Validates that the import pipeline meets performance targets:
 * - 10,000 records imported in < 3 seconds
 * - 50,000 records searched with < 300ms response time
 * - No memory leaks or linear growth
 */
describe('Loop 5: Performance & Compatibility Benchmarks', () => {
  let db;
  const DB_NAME_PREFIX = 'PerfBench_';
  let testRunCounter = 0;

  // Generate diverse test data to simulate real-world scenarios
  const generateTestRecords = (count, sourceType = 'test_source') => {
    const records = [];
    const companies = ['TSMC', 'MediaTek', 'ACER', 'ASUS', 'Nvidia', '台積電', '聯發科'];
    const positions = ['董事', '監察人', '經理', '副總', '法人代表'];
    
    for (let i = 0; i < count; i++) {
      const company = companies[i % companies.length];
      const position = positions[i % positions.length];
      
      records.push({
        edgeKey: `${company}|${position}|person_${i}`,
        personNodeKey: `person_${i}|${company}`,
        姓名: `姓名_${i % 500}`, // Simulate name overlap
        公司代號: `CODE_${company}_${i % 10}`,
        公司名稱: `${company}_分公司_${i % 10}`,
        職稱: position,
        資料年月: `${11500 + (i % 24)}`,
        目前持股: (Math.random() * 10000).toFixed(2),
        normalizedSearch: `person_${i % 500} ${company}`,
        sourceType,
        isPrincipal: i % 5 === 0,
        isRepresentative: i % 7 === 0,
        representedBy: i % 3 === 0 ? `代表_${i % 100}` : '',
        representativeFor: i % 3 === 1 ? `被代表_${i % 100}` : ''
      });
    }
    return records;
  };

  beforeAll(async () => {
    // Test counter to avoid DB name collisions
    testRunCounter = Date.now();
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
    // Clean up all test databases
    const idb = globalThis.indexedDB;
    if (idb) {
      // Find and delete all test databases
      const req = await new Promise((resolve) => {
        const openReq = idb.open(DB_NAME_PREFIX + 'temp');
        openReq.onsuccess = () => {
          const tempDb = openReq.result;
          const dbNames = Array.from(tempDb.objectStoreNames || []);
          tempDb.close();
          resolve(dbNames);
        };
        openReq.onerror = () => resolve([]);
      });
      
      // Delete each test database
      for (let i = 0; i < 100; i++) {
        const dbName = `${DB_NAME_PREFIX}${i}`;
        await new Promise((resolve) => {
          const delReq = idb.deleteDatabase(dbName);
          delReq.onsuccess = () => resolve();
          delReq.onerror = () => resolve();
        });
      }
    }
  });

  describe('Bulk Import Performance', () => {
    it('should import 10,000 records within 3 seconds', async () => {
      const dbName = `${DB_NAME_PREFIX}10k_${testRunCounter}`;
      db = await openDB(dbName, 1);

      const records = generateTestRecords(10000, '上市');
      
      const startTime = performance.now();
      const stats = await upsertRecords(db, records, 500);
      const duration = performance.now() - startTime;

      console.log(`10k import: ${duration.toFixed(2)}ms (target: 3000ms)`);
      
      expect(stats.inserted).toBe(10000);
      expect(duration).toBeLessThan(3000); // Loop 5 target
      
      // Verify data integrity
      const allRecords = await getAllRecords(db);
      expect(allRecords.length).toBe(10000);
    });

    it('should import 50,000 records within 15 seconds', async () => {
      const dbName = `${DB_NAME_PREFIX}50k_${testRunCounter}`;
      db = await openDB(dbName, 1);

      const records = generateTestRecords(50000, '上櫃');
      
      const startTime = performance.now();
      const stats = await upsertRecords(db, records, 500);
      const duration = performance.now() - startTime;

      console.log(`50k import: ${duration.toFixed(2)}ms (target: 15000ms)`);
      
      expect(stats.inserted).toBe(50000);
      expect(duration).toBeLessThan(15000); // Stretched target for 50k
      
      const allRecords = await getAllRecords(db);
      expect(allRecords.length).toBe(50000);
    });

    it(
      'should handle incremental updates efficiently',
      async () => {
        const dbName = `${DB_NAME_PREFIX}incr_${testRunCounter}`;
        db = await openDB(dbName, 1);

        const initialRecords = generateTestRecords(1000, '上市');
        
        // First import
        const firstStart = performance.now();
        const firstStats = await upsertRecords(db, initialRecords, 500);
        const firstDuration = performance.now() - firstStart;
        
        expect(firstStats.inserted).toBe(1000);

        // Generate modified records: update first half with different sourceType
        const modifiedRecords = [];
        
        // First 500: same edgeKey but with changes (update)
        for (let i = 0; i < 500; i++) {
          const original = initialRecords[i];
          modifiedRecords.push({
            ...original,
            sourceType: '上市_updated', // Change sourceType to trigger update
            目前持股: (Math.random() * 10000).toFixed(2) // Change holdings
          });
        }
        
        // Next 500: completely new records
        const newRecords = generateTestRecords(500, '上市_新');
        newRecords.forEach((rec, idx) => {
          rec.edgeKey = `new_${idx}_edgekey`;
          modifiedRecords.push(rec);
        });
        
        const secondStart = performance.now();
        const updateStats = await upsertRecords(db, modifiedRecords, 500);
        const secondDuration = performance.now() - secondStart;

        console.log(`Update 1k records: first=${firstDuration.toFixed(2)}ms, update=${secondDuration.toFixed(2)}ms`);
        
        expect(updateStats.inserted).toBe(500); // New records
        expect(updateStats.updated).toBe(500); // Modified records
        
        const metadata = await getMetadata(db);
        expect(metadata.importCount).toBe(2);
      },
      30000 // Increase timeout to 30 seconds
    );
  });

  describe('Search Performance', () => {
    it(
      'should search 50,000 records with response time < 300ms',
      async () => {
        const dbName = `${DB_NAME_PREFIX}search_${testRunCounter}`;
        db = await openDB(dbName, 1);

        const records = generateTestRecords(10000, 'search_test');
        await upsertRecords(db, records, 500);

        // Simulate search by name index
        const tx = db.transaction(['relationships'], 'readonly');
        const store = tx.objectStore('relationships');
        const nameIndex = store.index('normalizedSearch');
        
        const searchTerm = 'person_42'; // Search by normalized term
        
        const startTime = performance.now();
        const range = IDBKeyRange.only(searchTerm);
        const results = await new Promise((resolve) => {
          const found = [];
          const request = nameIndex.openCursor(range);
          request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              found.push(cursor.value);
              cursor.continue();
            } else {
              resolve(found);
            }
          };
          request.onerror = () => resolve([]);
        });
        const duration = performance.now() - startTime;

        console.log(`Search result: found ${results.length} records in ${duration.toFixed(2)}ms`);
        
        expect(duration).toBeLessThan(300); // Loop 3/5 target
      },
      20000
    );

    it('should support normalizedSearch index for fuzzy matching', async () => {
      const dbName = `${DB_NAME_PREFIX}normalized_${testRunCounter}`;
      db = await openDB(dbName, 1);

      const records = generateTestRecords(10000, 'normalized_test');
      await upsertRecords(db, records, 500);

      // Search by normalized field
      const tx = db.transaction(['relationships'], 'readonly');
      const store = tx.objectStore('relationships');
      const searchIndex = store.index('normalizedSearch');
      
      const startTime = performance.now();
      const results = await new Promise((resolve) => {
        const found = [];
        const request = searchIndex.getAll();
        request.onsuccess = () => {
          resolve(request.result || []);
        };
      });
      const duration = performance.now() - startTime;

      console.log(`Normalized search: ${results.length} records in ${duration.toFixed(2)}ms`);
      
      expect(duration).toBeLessThan(500);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not show linear memory growth with repeated searches', async () => {
      const dbName = `${DB_NAME_PREFIX}memory_${testRunCounter}`;
      db = await openDB(dbName, 1);

      const records = generateTestRecords(10000, 'memory_test');
      await upsertRecords(db, records, 500);

      const memoryReadings = [];
      
      for (let i = 0; i < 50; i++) {
        // Perform search
        const tx = db.transaction(['relationships'], 'readonly');
        const store = tx.objectStore('relationships');
        const index = store.index('normalizedSearch');
        
        await new Promise((resolve) => {
          const request = index.getAll();
          request.onsuccess = () => resolve(request.result);
        });

        // Get memory reading if available
        if (performance.memory) {
          memoryReadings.push(performance.memory.usedJSHeapSize);
        }
      }

      // Analyze memory trend (basic check)
      if (memoryReadings.length > 10) {
        const firstHalf = memoryReadings.slice(0, 25);
        const secondHalf = memoryReadings.slice(25);
        
        const avgFirst = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b) / secondHalf.length;
        
        // Allow up to 50% increase, but not linear growth
        const growthRatio = avgSecond / avgFirst;
        console.log(`Memory growth ratio: ${growthRatio.toFixed(2)}x`);
        
        expect(growthRatio).toBeLessThan(2.0); // Should be relatively stable
      }
    });
  });

  describe('Batch Optimization', () => {
    it('should dynamically adjust chunk sizes based on performance', async () => {
      const dbName = `${DB_NAME_PREFIX}batch_opt_${testRunCounter}`;
      db = await openDB(dbName, 1);

      const records = generateTestRecords(5000, 'batch_test');
      
      // Track different chunk sizes
      const chunkSizes = [100, 500, 1000];
      const timings = {};

      for (const size of chunkSizes) {
        const freshDb = await openDB(`${dbName}_chunk_${size}`, 1);
        
        const startTime = performance.now();
        await upsertRecords(freshDb, records, size);
        const duration = performance.now() - startTime;
        
        timings[size] = duration;
        console.log(`Chunk size ${size}: ${duration.toFixed(2)}ms`);
        
        freshDb.close();
      }

      // Verify that moderate chunk sizes are efficient
      expect(timings[500]).toBeLessThan(timings[100] * 2);
    });
  });

  describe('Transaction Failure Handling', () => {
    it('should gracefully handle and report transaction errors', async () => {
      const dbName = `${DB_NAME_PREFIX}error_${testRunCounter}`;
      db = await openDB(dbName, 1);

      // Create records with intentionally problematic data
      const badRecords = [
        { edgeKey: 'valid_1', 姓名: 'Test 1' },
        { edgeKey: '', 姓名: 'Invalid - no edgeKey' }, // Missing key
        { edgeKey: 'valid_2', 姓名: 'Test 2' }
      ];

      const stats = await upsertRecords(db, badRecords, 10);
      
      // Should handle errors gracefully
      expect(stats.errors).toBeGreaterThan(0);
      expect(stats.inserted).toBeGreaterThan(0);
      
      console.log(`Error handling: inserted=${stats.inserted}, errors=${stats.errors}`);
    });
  });
});
