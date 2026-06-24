/**
 * Utility for transforming IndexedDB records into Cytoscape.js elements.
 */

import { normalize } from './keys.js';

function parseShareNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  const text = String(value).trim();
  if (!text) {
    return 0;
  }

  const numeric = Number(text.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatShareNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  return numeric.toLocaleString('en-US');
}

/**
 * @typedef {Object} GraphElement
 * @property {string} data.id
 * @property {string} data.type
 * @property {Object} [data.label]
 * @property {Object} [data.title]
 * @property {Object} [data.companyCode]
 * @property {Object} [data.name]
 */

/**
 * Transforms a flat array of standardized records into Cytoscape elements.
 * 
 * @param {Array<Object>} records - The standardized records from IndexedDB.
 * @returns {Array<GraphElement>} The elements array (nodes and edges).
 */
export function transformRecordsToElements(records) {
  const nodes = new Map(); // Use Map to ensure node uniqueness by ID
  const edges = [];
  const personMeta = new Map();

  for (const record of records) {
    const personNodeKey = normalize(record.姓名) || record.personNodeKey;

    // 1. Ensure Company Node exists
    if (record.公司代號) {
      const companyId = `company_${record.公司代號}`;
      if (!nodes.has(companyId)) {
        nodes.set(companyId, {
          data: {
            id: companyId,
            type: 'company',
            label: record.公司名稱,
            companyCode: record.公司代號
          }
        });
      }
    }

    // 2. Ensure Person Node exists
    if (personNodeKey) {
      const personId = `person_${personNodeKey}`;
      if (!nodes.has(personId)) {
        nodes.set(personId, {
          data: {
            id: personId,
            type: 'person',
            label: record.姓名,
            name: record.姓名,
            holdingShares: 0,
            holdingSharesText: '0',
            titles: [],
            titleText: ''
          }
        });
      }

      if (!personMeta.has(personId)) {
        personMeta.set(personId, {
          maxHoldingShares: 0,
          titleSet: new Set()
        });
      }

      const meta = personMeta.get(personId);
      const holdingShares = Math.max(
        parseShareNumber(record.目前持股),
        parseShareNumber(record.選任時持股)
      );
      const title = normalize(record.職稱);

      meta.maxHoldingShares = Math.max(meta.maxHoldingShares, holdingShares);
      if (title) {
        meta.titleSet.add(title);
      }
    }

    // 3. Create Edge (Relationship)
    if (record.edgeKey && personNodeKey && record.公司代號) {
      edges.push({
        data: {
          id: record.edgeKey,
          source: `person_${personNodeKey}`,
          target: `company_${record.公司代號}`,
          title: record.職稱
        }
      });
    }
  }

  for (const [personId, meta] of personMeta.entries()) {
    const node = nodes.get(personId);
    if (!node) {
      continue;
    }

    const titles = Array.from(meta.titleSet);
    node.data.holdingShares = meta.maxHoldingShares;
    node.data.holdingSharesText = formatShareNumber(meta.maxHoldingShares);
    node.data.titles = titles;
    node.data.titleText = titles.join('、');
  }

  return [...nodes.values(), ...edges];
}
