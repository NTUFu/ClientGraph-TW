/**
 * Key utilities for generating storage and graph keys.
 */

/**
 * Normalizes a string according to CODE_STYLE.md rules:
 * 1. Convert full-width space (　) to half-width space.
 * 2. Trim leading and trailing whitespace.
 * 3. Collapse multiple spaces into a single space.
 *
 * @param {string} str - The input string to normalize.
 * @returns {string} The normalized string.
 */
export function normalize(str) {
  if (str === null || str === undefined) {
    return '';
  }
  const stringified = String(str);
  // Replace full-width space (\u3000) with half-width space
  let normalized = stringified.replace(/\u3000/g, ' ');
  // Trim leading/trailing whitespace
  normalized = normalized.trim();
  // Collapse consecutive whitespace characters into a single space
  normalized = normalized.replace(/\s+/g, ' ');
  return normalized;
}

/**
 * Computes deterministic storage key (edgeKey) for an edge.
 * edgeKey = normalize(姓名) + | + normalize(公司代號) + | + normalize(職稱)
 *
 * @param {string} name - Name (姓名)
 * @param {string} companyCode - Company code (公司代號)
 * @param {string} title - Title (職稱)
 * @returns {string} The unique edgeKey
 */
export function generateEdgeKey(name, companyCode, title) {
  return `${normalize(name)}|${normalize(companyCode)}|${normalize(title)}`;
}

/**
 * Computes deterministic graph-layer key for a person node.
 * personNodeKey = normalize(姓名) + | + normalize(公司代號)
 *
 * @param {string} name - Name (姓名)
 * @param {string} companyCode - Company Code (公司代號)
 * @returns {string} The unique personNodeKey
 */
export function generatePersonNodeKey(name, companyCode) {
  return `${normalize(name)}|${normalize(companyCode)}`;
}
