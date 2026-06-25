import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, getMetadata, upsertRecords, getRecordsByCompanyCodes } from '../src/utils/db.js';

describe('IndexedDB Core Tests', () => {
  let db;
  const DB_NAME = 'TestClientGraphDB';
  let dbVersion = 1;

  async function deleteDB() {
    if (db) db.close();
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }

  beforeEach(async () => {
    await deleteDB();
    db = await openDB(DB_NAME, dbVersion);
  });

  afterEach(async () => {
    await deleteDB();
  });

  it('should initialize relationships and metadata stores correctly', async () => {
    expect(db.objectStoreNames.contains('relationships')).toBe(true);
    expect(db.objectStoreNames.contains('metadata')).toBe(true);

    const tx = db.transaction(['relationships'], 'readonly');
    const store = tx.objectStore('relationships');
    expect(store.keyPath).toBe('edgeKey');
    expect(store.indexNames.contains('companyCode')).toBe(true);
    expect(store.indexNames.contains('name')).toBe(true);
    expect(store.indexNames.contains('title')).toBe(true);
    expect(store.indexNames.contains('dataYearMonth')).toBe(true);
    expect(store.indexNames.contains('sourceType')).toBe(true);
    expect(store.indexNames.contains('normalizedSearch')).toBe(true);
  });

  it('should handle sequential upgrade processes without clearing data', async () => {
    // Let's first put a test record
    const tx = db.transaction(['relationships'], 'readwrite');
    const store = tx.objectStore('relationships');
    await new Promise((resolve, reject) => {
      const req = store.put({ edgeKey: 'A|1101|董事長', 姓名: 'A', '公司代號': '1101', '職稱': '董事長' });
      req.onsuccess = () => resolve();
      req.onerror = () => reject();
    });
    db.close();

    // Now open with higher version
    dbVersion = 2;
    const db2 = await openDB(DB_NAME, dbVersion);
    expect(db2.objectStoreNames.contains('relationships')).toBe(true);

    // Verify data still exists
    const tx2 = db2.transaction(['relationships'], 'readonly');
    const store2 = tx2.objectStore('relationships');
    const record = await new Promise((resolve) => {
      const req = store2.get('A|1101|董事長');
      req.onsuccess = () => resolve(req.result);
    });

    expect(record).toBeDefined();
    expect(record.姓名).toBe('A');
    db2.close();
  });

  it('should perform first-time upserts and accumulate metadata correctly', async () => {
    const records = [
      {
        edgeKey: '張安平|1101|董事長之法人代表人',
        personNodeKey: '張安平|1101',
        normalizedSearch: '張安平 1101 台泥 董事長之法人代表人',
        sourceType: '上市',
        資料年月: '11504',
        姓名: '張安平',
        公司代號: '1101',
        公司名稱: '台泥',
        職稱: '董事長之法人代表人',
        目前持股: '4000000'
      },
      {
        edgeKey: '程耀輝|1101|董事之法人代表人',
        personNodeKey: '程耀輝|1101',
        normalizedSearch: '程耀輝 1101 台泥 董事之法人代表人',
        sourceType: '上市',
        資料年月: '11504',
        姓名: '程耀輝',
        公司代號: '1101',
        公司名稱: '台泥',
        職稱: '董事之法人代表人',
        目前持股: '200000'
      }
    ];

    const stats = await upsertRecords(db, records);
    expect(stats.inserted).toBe(2);
    expect(stats.updated).toBe(0);
    expect(stats.skipped).toBe(0);

    // Verify metadata was generated
    const meta = await getMetadata(db);
    expect(meta).not.toBeNull();
    expect(meta.latestDataMonth).toBe('11504');
    expect(meta.sourceTypes).toContain('上市');
    expect(meta.sourceSummary['上市']).toBe(2);
    expect(meta.importCount).toBe(1);
  });

  it('should skip exact duplicate records and track difference updates', async () => {
    const records = [
      {
        edgeKey: '張安平|1101|董事長之法人代表人',
        personNodeKey: '張安平|1101',
        normalizedSearch: '張安平 1101 台泥 董事長之法人代表人',
        sourceType: '上市',
        資料年月: '11504',
        姓名: '張安平',
        公司代號: '1101',
        公司名稱: '台泥',
        職稱: '董事長之法人代表人',
        目前持股: '4000000'
      }
    ];

    // First import
    const stats1 = await upsertRecords(db, records);
    expect(stats1.inserted).toBe(1);

    // Second import of exact same records -> expect skip
    const stats2 = await upsertRecords(db, records);
    expect(stats2.inserted).toBe(0);
    expect(stats2.skipped).toBe(1);
    expect(stats2.updated).toBe(0);

    // Verify importCount remained 1 because nothing was updated or inserted
    let meta = await getMetadata(db);
    expect(meta.importCount).toBe(1);

    // Third import of modified record -> expect update
    const modifiedRecords = [
      {
        ...records[0],
        目前持股: '5000000' // changed field
      }
    ];
    const stats3 = await upsertRecords(db, modifiedRecords);
    expect(stats3.inserted).toBe(0);
    expect(stats3.skipped).toBe(0);
    expect(stats3.updated).toBe(1);

    // Verify importCount incremented to 2 and sourceSummary is still 1
    meta = await getMetadata(db);
    expect(meta.importCount).toBe(2);
    expect(meta.sourceSummary['上市']).toBe(1);
  });

  it('should fetch 2330 relationship records by company code for drill-down', async () => {
    const records = [
      {
        edgeKey: '張三|2330|董事',
        personNodeKey: '張三',
        normalizedSearch: '張三 2330 台積電 董事',
        sourceType: '上市',
        資料年月: '11504',
        姓名: '張三',
        公司代號: '2330',
        公司名稱: '台積電',
        職稱: '董事',
        目前持股: '1000'
      },
      {
        edgeKey: '李四|2330|獨立董事',
        personNodeKey: '李四',
        normalizedSearch: '李四 2330 台積電 獨立董事',
        sourceType: '上市',
        資料年月: '11504',
        姓名: '李四',
        公司代號: '2330',
        公司名稱: '台積電',
        職稱: '獨立董事',
        目前持股: '2000'
      },
      {
        edgeKey: '王五|2317|董事',
        personNodeKey: '王五',
        normalizedSearch: '王五 2317 鴻海 董事',
        sourceType: '上市',
        資料年月: '11504',
        姓名: '王五',
        公司代號: '2317',
        公司名稱: '鴻海',
        職稱: '董事',
        目前持股: '1500'
      }
    ];

    await upsertRecords(db, records);

    const company2330Records = await getRecordsByCompanyCodes(db, ['2330'], 100);
    expect(company2330Records).toHaveLength(2);
    expect(company2330Records.every((record) => record.公司代號 === '2330')).toBe(true);

    const limited = await getRecordsByCompanyCodes(db, ['2330'], 1);
    expect(limited).toHaveLength(1);
    expect(limited[0].公司代號).toBe('2330');
  });
});
