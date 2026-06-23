import 'fake-indexeddb/auto';
import { openDB } from '../src/utils/db.js';
import { ImportService } from '../src/utils/import-service.js';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runBenchmark() {
  const DB_NAME = 'ClientGraphTW';
  const LARGE_COUNT = 10000;
  const NL = String.fromCharCode(10);
  
  console.log(`Starting benchmark: importing ${LARGE_COUNT} records...`);

  // 1. Setup Mock File
  const csvHeader = '出表日期,資料年月,公司代號,公司名稱,職稱,姓名,選任時持股,目前持股,設質股數,設質股數佔持股比例,內部人關係人目前持股合計,內部人關係人設質股數,內部人關係人設質比例' + NL;
  let rows = [];
  for (let i = 0; i < LARGE_COUNT; i++) {
    rows.push(`1120401,11203,${1000 + i},測試公司${i},董事,姓名${i},100,100,0,0.00%,0,0,0.00%`);
  }
  const csvText = csvHeader + rows.join(NL);
  
  const file = {
    text: () => Promise.resolve(csvText),
    name: 'benchmark_test.csv'
  };

  // 2. Cleanup previous DB
  const idb = globalThis.indexedDB;
  if (idb) {
    await new Promise((resolve) => {
      const req = idb.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }

  // 3. Run Import
  const service = new ImportService();
  
  const start = performance.now();
  const result = await service.importCSV(file, '上市');
  const end = performance.now();
  const duration = end - start;

  // 4. Report Results
  console.log('--- Benchmark Results ---');
  console.log(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  if (!result.success) {
    console.error(`Error: ${result.error}`);
  } else {
    console.log(`Total Raw: ${result.totalRaw}`);
    console.log(`Total Valid: ${result.totalValid}`);
    console.log(`Stats:`, result.stats);
    console.log(`Duration: ${duration.toFixed(2)}ms`);
    console.log(`KPI Check (10k < 3s): ${duration < 3000 ? 'PASSED' : 'FAILED'}`);
  }
  console.log('-------------------------');

  // 5. Cleanup
  if (idb) {
    await new Promise((resolve) => {
      const req = idb.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
