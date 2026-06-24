import { normalize } from './keys.js';

const PERSON_TOP_LIMIT = 10;
const COMPANY_TOP_LIMIT = 10;

function toNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  const text = String(value).trim();
  if (!text) {
    return 0;
  }

  const cleaned = text.replace(/,/g, '').replace(/%/g, '');
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getHoldingValue(record) {
  const currentHolding = toNumber(record?.目前持股);
  if (currentHolding > 0) {
    return currentHolding;
  }

  return toNumber(record?.選任時持股);
}

function getPledgeRatio(record) {
  const ratio = toNumber(record?.設質股數佔持股比例);
  if (ratio > 0) {
    return Math.min(100, ratio);
  }

  const pledgeShares = toNumber(record?.設質股數);
  const holding = getHoldingValue(record);
  if (pledgeShares <= 0 || holding <= 0) {
    return 0;
  }

  return Math.min(100, (pledgeShares / holding) * 100);
}

function getTitleSensitivity(title) {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) {
    return 60;
  }

  if (normalizedTitle.includes('董事長') || normalizedTitle.includes('總經理')) {
    return 100;
  }

  if (
    normalizedTitle.includes('董事') ||
    normalizedTitle.includes('監察人') ||
    normalizedTitle.includes('執行長')
  ) {
    return 80;
  }

  return 60;
}

function getRiskLevel(score) {
  if (score >= 80) {
    return 'high';
  }
  if (score >= 60) {
    return 'medium-high';
  }
  if (score >= 40) {
    return 'medium';
  }
  return 'low';
}

function percentileScore(value, sortedValues) {
  if (!sortedValues.length) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return 100;
  }

  let position = 0;
  for (let i = 0; i < sortedValues.length; i++) {
    if (value >= sortedValues[i]) {
      position = i;
    }
  }

  return (position / (sortedValues.length - 1)) * 100;
}

function getCompanyExposureScore(companyCount) {
  if (companyCount <= 1) {
    return 0;
  }

  return Math.min(100, ((companyCount - 1) / 4) * 100);
}

function normalizeScore(score) {
  return Math.max(0, Math.min(100, score));
}

function roundToOneDecimal(value) {
  return Math.round(value * 10) / 10;
}

export function buildRiskRadar(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      personRiskTop: [],
      companyRiskTop: []
    };
  }

  const personMap = new Map();
  const companyMap = new Map();

  for (const record of records) {
    const name = normalize(record?.姓名);
    const companyCode = normalize(record?.公司代號);
    const companyName = normalize(record?.公司名稱) || companyCode;
    const title = normalize(record?.職稱);

    if (!name || !companyCode) {
      continue;
    }

    if (!personMap.has(name)) {
      personMap.set(name, {
        name,
        companySet: new Set(),
        maxHolding: 0,
        maxPledgeRatio: 0,
        maxTitleSensitivity: 60
      });
    }

    const person = personMap.get(name);
    person.companySet.add(companyCode);
    person.maxHolding = Math.max(person.maxHolding, getHoldingValue(record));
    person.maxPledgeRatio = Math.max(person.maxPledgeRatio, getPledgeRatio(record));
    person.maxTitleSensitivity = Math.max(person.maxTitleSensitivity, getTitleSensitivity(title));

    if (!companyMap.has(companyCode)) {
      companyMap.set(companyCode, {
        companyCode,
        companyName,
        personNames: new Set()
      });
    }

    companyMap.get(companyCode).personNames.add(name);
  }

  const holdingValues = Array.from(personMap.values())
    .map(person => person.maxHolding)
    .sort((a, b) => a - b);

  const personRiskRecords = Array.from(personMap.values()).map(person => {
    const pledgeScore = person.maxPledgeRatio;
    const holdingScore = percentileScore(person.maxHolding, holdingValues);
    const exposureScore = getCompanyExposureScore(person.companySet.size);
    const titleScore = person.maxTitleSensitivity;

    const weightedScore =
      (0.4 * pledgeScore) +
      (0.25 * holdingScore) +
      (0.2 * exposureScore) +
      (0.15 * titleScore);

    const score = roundToOneDecimal(normalizeScore(weightedScore));

    return {
      id: `person_${person.name}`,
      name: person.name,
      companyCount: person.companySet.size,
      holding: person.maxHolding,
      pledgeRatio: roundToOneDecimal(pledgeScore),
      score,
      level: getRiskLevel(score)
    };
  });

  personRiskRecords.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const personScoreMap = new Map(personRiskRecords.map(person => [person.name, person.score]));

  const companyRiskRecords = Array.from(companyMap.values()).map(company => {
    const personScores = Array.from(company.personNames)
      .map(name => personScoreMap.get(name) || 0)
      .sort((a, b) => b - a);

    const topScores = personScores.slice(0, 3);
    let score = 0;

    if (topScores.length === 1) {
      score = topScores[0];
    } else if (topScores.length === 2) {
      score = (0.6 * topScores[0]) + (0.4 * topScores[1]);
    } else if (topScores.length >= 3) {
      score = (0.5 * topScores[0]) + (0.3 * topScores[1]) + (0.2 * topScores[2]);
    }

    const normalizedCompanyScore = roundToOneDecimal(normalizeScore(score));

    return {
      id: `company_${company.companyCode}`,
      companyCode: company.companyCode,
      companyName: company.companyName,
      personCount: company.personNames.size,
      score: normalizedCompanyScore,
      level: getRiskLevel(normalizedCompanyScore)
    };
  });

  companyRiskRecords.sort((a, b) => b.score - a.score || a.companyCode.localeCompare(b.companyCode));

  return {
    personRiskTop: personRiskRecords.slice(0, PERSON_TOP_LIMIT),
    companyRiskTop: companyRiskRecords.slice(0, COMPANY_TOP_LIMIT)
  };
}
