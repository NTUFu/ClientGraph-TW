import { describe, it, expect } from 'vitest';
import { buildRiskRadar } from '../src/utils/risk-radar.js';

describe('Risk Radar Utility Tests', () => {
  it('should return empty rankings for empty input', () => {
    const result = buildRiskRadar([]);
    expect(result.personRiskTop).toHaveLength(0);
    expect(result.companyRiskTop).toHaveLength(0);
  });

  it('should rank higher risk person first based on pledge ratio and exposure', () => {
    const records = [
      {
        姓名: '張安平',
        公司代號: '1101',
        公司名稱: '台泥',
        職稱: '董事長',
        目前持股: '8,000',
        設質股數佔持股比例: '80%'
      },
      {
        姓名: '張安平',
        公司代號: '2330',
        公司名稱: '台積電',
        職稱: '顧問',
        目前持股: '2,000',
        設質股數佔持股比例: '40%'
      },
      {
        姓名: '程耀輝',
        公司代號: '1101',
        公司名稱: '台泥',
        職稱: '董事',
        目前持股: '2,000',
        設質股數佔持股比例: '5%'
      }
    ];

    const result = buildRiskRadar(records);
    expect(result.personRiskTop).toHaveLength(2);
    expect(result.personRiskTop[0].name).toBe('張安平');
    expect(result.personRiskTop[0].companyCount).toBe(2);
    expect(result.personRiskTop[0].score).toBeGreaterThan(result.personRiskTop[1].score);
  });

  it('should generate company ranking from top person risk scores', () => {
    const records = [
      {
        姓名: '甲',
        公司代號: 'C1',
        公司名稱: '公司一',
        職稱: '董事長',
        目前持股: '9,000',
        設質股數佔持股比例: '70%'
      },
      {
        姓名: '乙',
        公司代號: 'C1',
        公司名稱: '公司一',
        職稱: '董事',
        目前持股: '3,000',
        設質股數佔持股比例: '20%'
      },
      {
        姓名: '丙',
        公司代號: 'C2',
        公司名稱: '公司二',
        職稱: '顧問',
        目前持股: '1,000',
        設質股數佔持股比例: '0%'
      }
    ];

    const result = buildRiskRadar(records);
    expect(result.companyRiskTop).toHaveLength(2);
    expect(result.companyRiskTop[0].companyCode).toBe('C1');
    expect(result.companyRiskTop[0].score).toBeGreaterThan(result.companyRiskTop[1].score);
  });
});
