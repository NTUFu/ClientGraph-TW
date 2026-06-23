import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openDB } from '../src/utils/db.js';
import { ImportService } from '../src/utils/import-service.js';

describe('Loop 5 Performance: Large Import', () => {
  let db;
  const DB_NAME = 'Loop5PerfDB';
  const LARGE_COUNT = 10000;

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

  it('should import 10000 records under 3 seconds', async () => {
    let csvHeader = '出表日期,資料年月,公司代號,公司名稱,職稱,姓名,選任時持股,目前持股,設質股數,設質股數佔持股比例,內部人關係人目前持股合計,內部人關係人設質股數,內部人關係人設質比例\n';
    let rows = [];
    for (let i = 0; i < LARGE_COUNT; i++) {
      rows.push(`1120401,11203,${1000 + i},測試公司${i},董事,姓名${i},100,100,0,0.00%,0,0,0.00%`);
    }
    const csvText = csvHeader + rows.join('\n');
    
    const file = {
      text: () => Promise.resolve(csvText),
      name: 'large_test.csv'
    };

    const service = new ImportService();
    
    const start = performance.now();
    const result = await service.importCSV(file, '上市');
    const end = performance.now();
    const duration = end - start;

    console.log(`Imported ${LARGE_COUNT} records via service in ${duration.toFixed(2)}ms`);

    expect(result.success).toBe(true);
    expect(result.totalValid).toBe(LARGE_COUNT);
    expect(duration).toBeLessThan(3000); // 3 seconds KPI
  }, 30000);
});
