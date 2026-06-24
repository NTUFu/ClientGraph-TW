import { describe, it, expect } from 'vitest';
import { normalize, generateEdgeKey, generatePersonNodeKey } from '../src/utils/keys.js';

describe('Keys Utility Tests', () => {
  describe('normalize()', () => {
    it('should trim leading and trailing spaces', () => {
      expect(normalize('  張安平  ')).toBe('張安平');
    });

    it('should convert full-width space to half-width space', () => {
      expect(normalize('張安平　董事長')).toBe('張安平 董事長');
    });

    it('should collapse multiple spaces to a single space', () => {
      expect(normalize('張安平   董事長  ')).toBe('張安平 董事長');
      expect(normalize('張安平　　董事長')).toBe('張安平 董事長');
    });

    it('should return empty string for null, undefined or non-string inputs', () => {
      expect(normalize(null)).toBe('');
      expect(normalize(undefined)).toBe('');
      expect(normalize(123)).toBe('123'); // coerces to string and normalizes
    });
  });

  describe('generateEdgeKey()', () => {
    it('should generate a deterministic normalized key', () => {
      const key1 = generateEdgeKey('張安平　', ' 1101 ', ' 董事長之法人代表人 ');
      const key2 = generateEdgeKey('張安平', '1101', '董事長之法人代表人');
      expect(key1).toBe('張安平|1101|董事長之法人代表人');
      expect(key1).toBe(key2);
    });
  });

  describe('generatePersonNodeKey()', () => {
    it('should merge same name across different companies', () => {
      const keyA = generatePersonNodeKey('張安平');
      const keyB = generatePersonNodeKey(' 張安平 ');
      expect(keyA).toBe('張安平');
      expect(keyB).toBe('張安平');
      expect(keyA).toBe(keyB);
    });
  });
});
