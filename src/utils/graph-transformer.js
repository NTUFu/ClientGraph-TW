/**
 * Utility for transforming IndexedDB records into Cytoscape.js elements.
 */

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

  for (const record of records) {
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
    if (record.personNodeKey) {
      const personId = `person_${record.personNodeKey}`;
      if (!nodes.has(personId)) {
        nodes.set(personId, {
          data: {
            id: personId,
            type: 'person',
            label: record.姓名,
            name: record.姓名
          }
        });
      }
    }

    // 3. Create Edge (Relationship)
    if (record.edgeKey && record.personNodeKey && record.公司代號) {
      edges.push({
        data: {
          id: record.edgeKey,
          source: `person_${record.personNodeKey}`,
          target: `company_${record.公司代號}`,
          title: record.職稱
        }
      });
    }
  }

  return [...nodes.values(), ...edges];
}
