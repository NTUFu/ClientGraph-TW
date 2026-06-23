import { generateEdgeKey, generatePersonNodeKey, normalize } from './keys.js';

/**
 * Parser and cleaner utilities for client relationships data.
 */

/**
 * Generator that parses CSV text line by line.
 * 
 * @param {string} csvText - The raw CSV string.
 * *yields* {Array<string>} Each yielded array represents a row of raw values.
 */
export function* parseCSVGenerator(csvText) {
  if (!csvText) return;
  
  let row = [''];
  let inQuote = false;
  const LF = String.fromCharCode(10);
  const CR = String.fromCharCode(13);
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (char === '"') {
      if (inQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++; // skip next quote
      } else {
        inQuote = !inQuote;
      }
    } else if (char === ',' && !inQuote) {
      row.push('');
    } else if ((char === LF || char === CR) && !inQuote) {
      if (char === CR && nextChar === LF) {
        i++;
      }
      yield row;
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  
  // Final row
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
    yield row;
  }
}

/**
 * Simple, robust CSV parser.
 * 
 * @param {string} csvText - The raw CSV string.
 * @returns {Array<Object>} Array of flat objects.
 */
export function parseCSV(csvText) {
  const allRows = Array.from(parseCSVGenerator(csvText));
  if (allRows.length === 0) return [];
  
  // Filter out completely empty rows
  const nonArr = allRows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
  if (nonArr.length === 0) return [];
  
  const headers = nonArr[0].map(h => h.trim());
  const result = [];
  
  for (let i = 1; i < nonArr.length; i++) {
    const values = nonArr[i];
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = index < values.length ? values[index] : '';
    });
    result.push(obj);
  }
  
  return result;
}

/**
 * Generator that cleans and standardizes raw flat records into Edge objects with keys.
 * 
 * @param {Iterable<Object>} rawRecordsIterable - An iterable of raw record objects.
 * @param {string} sourceType - Default source identifier ('上市', '上櫃', 'unknown').
 * *yields* {Object|null, Object|null} A tuple of [record, error].
 */
export function* cleanAndStandardizeGenerator(rawRecordsIterable, sourceType = 'unknown') {
  const importedAt = new Date().toISOString();
  const lastPrincipalMap = new Map();
  
  let rowNum = 0;
  
  for (const raw of rawRecordsIterable) {
    rowNum++;
    
    if (!raw || typeof raw !== 'object') {
      yield [null, { row: rowNum, reason: '資料列非有效物件。', raw }];
      continue;
    }
    
    // Required fields check
    const rawName = raw['姓名'];
    const rawCompanyCode = raw['公司代號'];
    const rawTitle = raw['職稱'];
    const rawDataMonth = raw['資料年月'];
    
    const missing = [];
    if (rawName === undefined || rawName === null || String(rawName).trim() === '') missing.push('姓名');
    if (rawCompanyCode === undefined || rawCompanyCode === null || String(rawCompanyCode).trim() === '') missing.push('公司代號');
    if (rawTitle === undefined || rawTitle === null || String(rawTitle).trim() === '') missing.push('職稱');
    if (rawDataMonth === undefined || rawDataMonth === null || String(rawDataMonth).trim() === '') missing.push('資料年月');
    
    if (missing.length > 0) {
      yield [null, { row: rowNum, reason: `缺少必要欄位: ${missing.join(', ')}`, raw }];
      continue;
    }
    
    const name = normalize(rawName);
    const companyCode = normalize(rawCompanyCode);
    const title = normalize(rawTitle);
    const dataYearMonth = normalize(rawDataMonth);
    
    if (!name || !companyCode || !title || !dataYearMonth) {
      const invalid = [];
      if (!name) invalid.push('姓名');
      if (!companyCode) invalid.push('公司代號');
      if (!title) invalid.push('職稱');
      if (!dataYearMonth) invalid.push('資料年月');
      
      yield [null, { row: rowNum, reason: `缺少必要欄位: ${invalid.join(', ')}`, raw }];
      continue;
    }
    
    const edgeKey = generateEdgeKey(name, companyCode, title);
    const personNodeKey = generatePersonNodeKey(name, companyCode);
    const companyName = normalize(raw['公司名稱']);
    
    const searchTerms = [name, companyCode, companyName, title].filter(Boolean);
    const normalizedSearch = searchTerms.join(' ');
    
    const record = {
      edgeKey,
      personNodeKey,
      normalizedSearch,
      sourceType,
      importedAt,
      
      出表日期: normalize(raw['出表日期']),
      資料年月: dataYearMonth,
      公司代號: companyCode,
      公司名稱: companyName,
      職稱: title,
      姓名: name,
      選任時持股: normalize(raw['選任時持股']) || '0',
      目前持股: normalize(raw['目前持股']) || '0',
      設質股數: normalize(raw['設質股數']) || '0',
      設質股數佔持股比例: normalize(raw['設質股數佔持股比例']) || '0.00%',
      內部人關係人目前持股合計: normalize(raw['內部人關係人目前持股合計']) || '0',
      內部人關係人設質股數: normalize(raw['內部人關係人設質股數']) || '0',
      內部人關係人設質比例: normalize(raw['內部人關係人設質比例']) || '0.00%',
      
      isPrincipal: title.endsWith('本人'),
      isRepresentative: title.endsWith('之法人代表人'),
      representedBy: '',
      representativeFor: ''
    };
    
    let baseTitle = '';
    if (record.isPrincipal) {
      baseTitle = title.slice(0, -2);
    } else if (record.isRepresentative) {
      baseTitle = title.slice(0, -6);
    }
    
    if (baseTitle) {
      const principalLookupKey = `${companyCode}|${baseTitle}`;
      if (record.isPrincipal) {
        lastPrincipalMap.set(principalLookupKey, record);
      } else if (record.isRepresentative) {
        const principal = lastPrincipalMap.get(principalLookupKey);
        if (principal && principal.資料年月 === dataYearMonth) {
          record.representativeFor = principal.姓名;
          principal.representedBy = record.姓名;
        }
      }
    }
    
    yield [record, null];
  }
}

/**
 * Cleans and standardizes raw flat records into Edge objects with keys.
 * 
 * @param {Array<Object>} rawRecords - The raw input array of records.
 * @param {string} sourceType - Default source identifier ('上市', '上櫃', 'unknown').
 * @returns {{ records: Array<Object>, errors: Array<Object> }} Cleaned records and descriptive errors.
 */
export function cleanAndStandardize(rawRecords, sourceType = 'unknown') {
  if (!Array.isArray(rawRecords)) {
    return {
      records: [],
      errors: [{ row: 0, reason: '輸入資料格式不正確，預期為陣列。' }]
    };
  }
  
  const records = [];
  const errors = [];
  
  for (const [record, error] of cleanAndStandardizeGenerator(rawRecords, sourceType)) {
    if (record) records.push(record);
    if (error) errors.push(error);
  }
  
  return { records, errors };
}
