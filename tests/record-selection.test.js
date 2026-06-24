import { describe, it, expect } from 'vitest';
import { selectPrimaryRecordsByMaxHolding } from '../src/utils/record-selection.js';

describe('Record Selection Utility Tests', () => {
  it('should select per-person record with largest holding', () => {
    const records = [
      { edgeKey: 'a', 姓名: '張安平', 公司代號: '1101', 目前持股: '1,500', 選任時持股: '0' },
      { edgeKey: 'b', 姓名: '張安平', 公司代號: '2330', 目前持股: '8,000', 選任時持股: '0' },
      { edgeKey: 'c', 姓名: '程耀輝', 公司代號: '1101', 目前持股: '300', 選任時持股: '0' }
    ];

    const selected = selectPrimaryRecordsByMaxHolding(records);
    expect(selected).toHaveLength(2);

    const byName = new Map(selected.map(record => [record.姓名, record]));
    expect(byName.get('張安平').公司代號).toBe('2330');
    expect(byName.get('程耀輝').公司代號).toBe('1101');
  });

  it('should fallback to 選任時持股 when 目前持股 is missing or zero', () => {
    const records = [
      { edgeKey: 'a', 姓名: '林本偉', 公司代號: 'A', 目前持股: '0', 選任時持股: '100' },
      { edgeKey: 'b', 姓名: '林本偉', 公司代號: 'B', 目前持股: '', 選任時持股: '220' }
    ];

    const selected = selectPrimaryRecordsByMaxHolding(records);
    expect(selected).toHaveLength(1);
    expect(selected[0].公司代號).toBe('B');
  });

  it('should break ties by newer data month then edgeKey', () => {
    const records = [
      { edgeKey: 'z-key', 姓名: '王小明', 公司代號: 'A', 目前持股: '100', 選任時持股: '0', 資料年月: '11412' },
      { edgeKey: 'a-key', 姓名: '王小明', 公司代號: 'B', 目前持股: '100', 選任時持股: '0', 資料年月: '11501' },
      { edgeKey: 'm-key', 姓名: '王小明', 公司代號: 'C', 目前持股: '100', 選任時持股: '0', 資料年月: '11501' }
    ];

    const selected = selectPrimaryRecordsByMaxHolding(records);
    expect(selected).toHaveLength(1);
    expect(selected[0].edgeKey).toBe('a-key');
  });
});
