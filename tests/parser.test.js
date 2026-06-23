import { describe, it, expect } from 'vitest';
import { parseCSV, cleanAndStandardize } from '../src/utils/parser.js';

describe('Parser and Cleaner Tests', () => {
  describe('parseCSV()', () => {
    it('should parse standard CSV text to flat array of objects', () => {
      const csv = `姓名,公司代號,職稱,資料年月,公司名稱
張安平,1101,董事長,11504,台泥
程耀輝,1101,董事,11504,台泥`;
      const result = parseCSV(csv);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        '姓名': '張安平',
        '公司代號': '1101',
        '職稱': '董事長',
        '資料年月': '11504',
        '公司名稱': '台泥'
      });
    });

    it('should handle quoted fields with commas and double quotes', () => {
      const csv = `姓名,公司代號,職稱,選任時持股
"張 ""安"" 平",1101,董事長,"3,000"`;
      const result = parseCSV(csv);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        '姓名': '張 "安" 平',
        '公司代號': '1101',
        '職稱': '董事長',
        '選任時持股': '3,000'
      });
    });
  });

  describe('cleanAndStandardize()', () => {
    it('should clean valid records and generate all required derived keys', () => {
      const raw = [
        {
          '姓名': '  張安平  ',
          '公司代號': ' 1101 ',
          '職稱': ' 董事長之法人代表人 ',
          '資料年月': '11504',
          '公司名稱': '台泥',
          '選任時持股': '0',
          '目前持股': '4057951'
        }
      ];

      const { records, errors } = cleanAndStandardize(raw, '上市');
      expect(errors).toHaveLength(0);
      expect(records).toHaveLength(1);
      
      const record = records[0];
      expect(record.姓名).toBe('張安平');
      expect(record.公司代號).toBe('1101');
      expect(record.職稱).toBe('董事長之法人代表人');
      expect(record.資料年月).toBe('11504');
      expect(record.edgeKey).toBe('張安平|1101|董事長之法人代表人');
      expect(record.personNodeKey).toBe('張安平|1101');
      expect(record.sourceType).toBe('上市');
      expect(record.isRepresentative).toBe(true);
      expect(record.isPrincipal).toBe(false);
      expect(record.normalizedSearch).toContain('張安平');
      expect(record.normalizedSearch).toContain('1101');
      expect(record.normalizedSearch).toContain('台泥');
    });

    it('should capture descriptive errors for invalid/missing fields', () => {
      const raw = [
        { '姓名': '張安平', '公司代號': '1101' }, // missing 職稱 & 資料年月
        { '姓名': '', '公司代號': '1101', '職稱': '董事', '資料年月': '11504' }, // empty 姓名
        { '姓名': '張安平', '公司代號': '  ', '職稱': '董事', '資料年月': '11504' } // blank companyCode
      ];

      const { records, errors } = cleanAndStandardize(raw, '上市');
      expect(records).toHaveLength(0);
      expect(errors).toHaveLength(3);
      
      expect(errors[0].row).toBe(1);
      expect(errors[0].reason).toContain('缺少必要欄位: 職稱, 資料年月');
      expect(errors[1].row).toBe(2);
      expect(errors[1].reason).toContain('缺少必要欄位: 姓名');
      expect(errors[2].row).toBe(3);
      expect(errors[2].reason).toContain('缺少必要欄位: 公司代號');
    });

    it('should bidirectionally link sequential Corporate Principal and Representative records', () => {
      const raw = [
        {
          '姓名': '嘉利實業股份有限公司',
          '公司代號': '1101',
          '職稱': '董事長本人',
          '資料年月': '11504',
          '公司名稱': '台泥'
        },
        {
          '姓名': '張安平',
          '公司代號': '1101',
          '職稱': '董事長之法人代表人',
          '資料年月': '11504',
          '公司名稱': '台泥'
        }
      ];

      const { records, errors } = cleanAndStandardize(raw, '上市');
      expect(errors).toHaveLength(0);
      expect(records).toHaveLength(2);

      const corp = records[0];
      const rep = records[1];

      expect(corp.isPrincipal).toBe(true);
      expect(corp.isRepresentative).toBe(false);
      expect(corp.representedBy).toBe('張安平');

      expect(rep.isPrincipal).toBe(false);
      expect(rep.isRepresentative).toBe(true);
      expect(rep.representativeFor).toBe('嘉利實業股份有限公司');
    });

    it('should not link Corporate Principal and Representative if their data months differ', () => {
      const raw = [
        {
          '姓名': '嘉利實業股份有限公司',
          '公司代號': '1101',
          '職稱': '董事長本人',
          '資料年月': '11503',
          '公司名稱': '台泥'
        },
        {
          '姓名': '張安平',
          '公司代號': '1101',
          '職稱': '董事長之法人代表人',
          '資料年月': '11504',
          '公司名稱': '台泥'
        }
      ];

      const { records, errors } = cleanAndStandardize(raw, '上市');
      expect(errors).toHaveLength(0);
      expect(records).toHaveLength(2);

      const corp = records[0];
      expect(corp.representedBy).toBe('');
      const rep = records[1];
      expect(rep.representativeFor).toBe('');
    });
  });
});
