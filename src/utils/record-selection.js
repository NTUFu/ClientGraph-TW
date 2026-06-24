import { normalize } from './keys.js';

function toShareNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  const text = String(value).trim();
  if (!text) {
    return 0;
  }

  const numeric = Number(text.replace(/,/g, '').replace(/%/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getHoldingScore(record) {
  // Prefer current holding, then fallback to appointment-time holding.
  const current = toShareNumber(record?.目前持股);
  if (current > 0) {
    return current;
  }
  return toShareNumber(record?.選任時持股);
}

function getDataMonthNumber(record) {
  const month = Number(normalize(record?.資料年月));
  return Number.isFinite(month) ? month : 0;
}

function comparePrimaryPriority(a, b) {
  const scoreDiff = getHoldingScore(b) - getHoldingScore(a);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const monthDiff = getDataMonthNumber(b) - getDataMonthNumber(a);
  if (monthDiff !== 0) {
    return monthDiff;
  }

  return normalize(a?.edgeKey).localeCompare(normalize(b?.edgeKey));
}

export function selectPrimaryRecordsByMaxHolding(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  const bestByName = new Map();

  for (const record of records) {
    const name = normalize(record?.姓名);
    if (!name) {
      continue;
    }

    const existing = bestByName.get(name);
    if (!existing || comparePrimaryPriority(record, existing) < 0) {
      bestByName.set(name, record);
    }
  }

  return Array.from(bestByName.values());
}
