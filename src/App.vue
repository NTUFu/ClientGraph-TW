<script setup>
import { ref, onMounted, computed } from 'vue';
import GraphContainer from './components/graph/GraphContainer.vue';
import ImportModal from './components/ImportModal.vue';
import { openDB, getMetadata, getRecordsByKeyword, getRecordsByNames, getRecordsByCompanyCodes, getRelationshipsCount, clearDatabase } from './utils/db.js';
import { transformRecordsToElements } from './utils/graph-transformer.js';
import { ImportService } from './utils/import-service.js';
import { selectPrimaryRecordsByMaxHolding } from './utils/record-selection.js';
import { buildRiskRadar } from './utils/risk-radar.js';

const graphRef = ref(null);
const elements = ref([]);
const selectedId = ref(null);
const selectedItem = ref(null);
const isLoaded = ref(false);
const error = ref(null);
const storageUsage = ref(0);
const indexedDbUsage = ref(null);
const loadingMessage = ref('請輸入關鍵字搜尋');
const totalRecordsCount = ref(0);
const visualizedRecordsCount = ref(0);
const searchKeyword = ref('');
const hasSearched = ref(false);
const isSearching = ref(false);
const isExtending = ref(false);
const extendingCompanyKey = ref('');
const searchNotice = ref('');
const personRiskTop = ref([]);
const companyRiskTop = ref([]);
const graphLayers = ref([]);
const activeLayerId = ref(null);
const layerSeed = ref(0);

const MAX_BASE_RECORDS = 2000;
const MAX_GRAPH_RECORDS = 5000;

// Import related
const isImportModalOpen = ref(false);
const importModalRef = ref(null);
const importService = new ImportService();

const fetchStorageUsage = async () => {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      storageUsage.value = estimate.usage || 0;

      // usageDetails is browser-dependent (Chromium supports it, Safari may not).
      const indexed = estimate?.usageDetails?.indexedDB;
      indexedDbUsage.value = typeof indexed === 'number' ? indexed : null;
    } catch (err) {
      console.error('Failed to estimate storage:', err);
    }
  }
};

const refreshCountsOnly = async () => {
  try {
    const db = await openDB();
    totalRecordsCount.value = await getRelationshipsCount(db);
    await fetchStorageUsage();
  } catch (err) {
    console.error('Failed to refresh count:', err);
    error.value = err.message;
  }
};

const layerTrail = computed(() => {
  return graphLayers.value.map((layer, index) => ({
    id: layer.id,
    depth: index + 1,
    label: layer.label
  }));
});

const getLayerScopedId = (layerId, rawId) => `layer_${layerId}__${rawId}`;

const mergeGraphLayersToElements = () => {
  const merged = [];
  for (const layer of graphLayers.value) {
    const isDimmed = layer.id !== activeLayerId.value;
    for (const element of layer.elements) {
      const data = element?.data || {};
      const originalId = data.id;
      const scoped = {
        ...data,
        originalId,
        layerId: layer.id,
        layerDepth: layer.depth,
        layerLabel: layer.label,
        layerState: isDimmed ? 'dimmed' : 'active',
        id: getLayerScopedId(layer.id, originalId)
      };

      if (data.source && data.target) {
        scoped.source = getLayerScopedId(layer.id, data.source);
        scoped.target = getLayerScopedId(layer.id, data.target);
      }

      merged.push({ data: scoped });
    }
  }
  elements.value = merged;
  visualizedRecordsCount.value = graphLayers.value.reduce((sum, layer) => sum + layer.recordsCount, 0);
};

const appendGraphLayer = (records, label) => {
  const id = ++layerSeed.value;
  const depth = graphLayers.value.length + 1;
  const transformed = transformRecordsToElements(records);

  graphLayers.value = [
    ...graphLayers.value,
    {
      id,
      depth,
      label,
      recordsCount: records.length,
      elements: transformed
    }
  ];
  activeLayerId.value = id;
  mergeGraphLayersToElements();
};

const resetGraphLayers = (records, label) => {
  layerSeed.value = 0;
  graphLayers.value = [];
  activeLayerId.value = null;
  selectedId.value = null;
  selectedItem.value = null;
  if (records.length > 0) {
    appendGraphLayer(records, label);
  } else {
    elements.value = [];
    visualizedRecordsCount.value = 0;
  }
};

const runSearch = async () => {
  const keyword = searchKeyword.value.trim();
  if (!keyword) {
    searchNotice.value = '請先輸入關鍵字 (姓名 / 公司代號 / 公司名稱 / 職稱)。';
    return;
  }

  try {
    isSearching.value = true;
    isExtending.value = false;
    isLoaded.value = false;
    selectedId.value = null;
    selectedItem.value = null;
    hasSearched.value = true;
    error.value = null;
    loadingMessage.value = '正在搜尋資料...';

    const db = await openDB();
    const matchedRecords = await getRecordsByKeyword(db, keyword, MAX_BASE_RECORDS);
    const baseRecords = selectPrimaryRecordsByMaxHolding(matchedRecords);

    // One-hop expansion starts from each matched person's max-holding company record.
    let expandedRecords = [];
    if (baseRecords.length > 0) {
      loadingMessage.value = '正在以持股最大公司延伸關聯...';
      const matchedNames = baseRecords.map(record => record?.姓名).filter(Boolean);
      const remainingSlots = Math.max(0, MAX_GRAPH_RECORDS - baseRecords.length);
      expandedRecords = await getRecordsByNames(db, matchedNames, remainingSlots);
    }

    const dedupedMap = new Map();
    for (const record of [...baseRecords, ...expandedRecords]) {
      if (record?.edgeKey && !dedupedMap.has(record.edgeKey)) {
        dedupedMap.set(record.edgeKey, record);
      }
    }

    const records = Array.from(dedupedMap.values());
    resetGraphLayers(records, `起點：${keyword}`);

    const radar = buildRiskRadar(records);
    personRiskTop.value = radar.personRiskTop;
    companyRiskTop.value = radar.companyRiskTop;

    if (records.length === 0) {
      searchNotice.value = '查無資料，請更換關鍵字再試一次。';
    } else if (records.length >= MAX_GRAPH_RECORDS) {
      searchNotice.value = `已載入上限 ${MAX_GRAPH_RECORDS} 筆（含持股主公司外延），請輸入更精準關鍵字。`;
    } else {
      const expandedCount = Math.max(0, records.length - baseRecords.length);
      searchNotice.value = `已載入第 1 層 ${records.length} 筆（持股主公司 ${baseRecords.length} 人，外延 ${expandedCount} 筆）。`;
    }

    isLoaded.value = true;
  } catch (err) {
    console.error('Failed to search data:', err);
    error.value = err.message;
    personRiskTop.value = [];
    companyRiskTop.value = [];
  } finally {
    isSearching.value = false;
  }
};

const extendFromCompany = async (companyNode = null) => {
  const selected = companyNode || selectedItem.value;
  if (!selected || selected.itemKind !== 'node' || selected.type !== 'company') {
    return;
  }

  const companyCode = selected.companyCode;
  if (!companyCode) {
    searchNotice.value = '此公司節點缺少公司代號，無法延伸。';
    return;
  }

  const extendKey = `${selected.layerId || 'root'}:${companyCode}`;
  if (isExtending.value || extendingCompanyKey.value === extendKey) {
    return;
  }

  try {
    isExtending.value = true;
    extendingCompanyKey.value = extendKey;
    isLoaded.value = false;
    error.value = null;
    loadingMessage.value = `正在延伸公司 ${companyCode} 關係圖...`;

    const db = await openDB();
    const companyRecords = await getRecordsByCompanyCodes(db, [companyCode], MAX_BASE_RECORDS);
    const baseRecords = selectPrimaryRecordsByMaxHolding(companyRecords);

    let expandedRecords = [];
    if (baseRecords.length > 0) {
      loadingMessage.value = `正在延伸公司 ${companyCode} 的關聯人物跨公司職務...`;
      const matchedNames = baseRecords.map(record => record?.姓名).filter(Boolean);
      const remainingSlots = Math.max(0, MAX_GRAPH_RECORDS - baseRecords.length);
      expandedRecords = await getRecordsByNames(db, matchedNames, remainingSlots);
    }

    const dedupedMap = new Map();
    for (const record of [...baseRecords, ...expandedRecords]) {
      if (record?.edgeKey && !dedupedMap.has(record.edgeKey)) {
        dedupedMap.set(record.edgeKey, record);
      }
    }

    const records = Array.from(dedupedMap.values());
    if (records.length === 0) {
      searchNotice.value = `公司 ${companyCode} 查無可延伸資料。`;
      isLoaded.value = true;
      return;
    }

    const nextDepth = graphLayers.value.length + 1;
    appendGraphLayer(records, `第 ${nextDepth} 層：${selected.label || companyCode} (${companyCode})`);

    const radar = buildRiskRadar(records);
    personRiskTop.value = radar.personRiskTop;
    companyRiskTop.value = radar.companyRiskTop;

    const expandedCount = Math.max(0, records.length - baseRecords.length);
    searchNotice.value = `已延伸到第 ${nextDepth} 層，新增 ${records.length} 筆（主公司 ${baseRecords.length} 人，外延 ${expandedCount} 筆）；前層圖譜已淡化。`;
    isLoaded.value = true;
  } catch (err) {
    console.error('Failed to extend graph from company:', err);
    error.value = err.message;
  } finally {
    isExtending.value = false;
    extendingCompanyKey.value = '';
  }
};

onMounted(async () => {
  try {
    await refreshCountsOnly();
  } catch (err) {
    console.error('Failed to load data:', err);
    error.value = err.message;
  }
});

const openImportModal = () => {
  isImportModalOpen.value = true;
};

const closeImportModal = () => {
  isImportModalOpen.value = false;
};

const handleClearDatabase = async () => {
  // Show confirmation dialog
  const confirmed = confirm('確定要清除所有資料嗎？清除後必須重新匯入資料。');
  if (!confirmed) return;

  try {
    const db = await openDB();
    await clearDatabase(db);
    
    // Reset page state
    elements.value = [];
    graphLayers.value = [];
    activeLayerId.value = null;
    layerSeed.value = 0;
    selectedId.value = null;
    selectedItem.value = null;
    isLoaded.value = false;
    searchKeyword.value = '';
    hasSearched.value = false;
    searchNotice.value = '';
    totalRecordsCount.value = 0;
    visualizedRecordsCount.value = 0;
    loadingMessage.value = '請輸入關鍵字搜尋';
    
    alert('資料已清除');
    await refreshCountsOnly();
  } catch (err) {
    console.error('Failed to clear database:', err);
    error.value = '清除資料失敗: ' + err.message;
  }
};

const handleImportFile = async (importParams) => {
  const { file, sourceType } = importParams;
  
  const result = await importService.importCSV(file, sourceType, (progressData) => {
    importModalRef.value?.updateProgress(progressData);
  });

  if (result.success) {
    // Include metadata in the results if available
    const db = await openDB();
    const metadata = await getMetadata(db);
    result.metadata = metadata;

    importModalRef.value?.setResults(result);
    await refreshCountsOnly();

    // If user already searched, rerun search to reflect latest imported data.
    if (hasSearched.value && searchKeyword.value.trim()) {
      await runSearch();
    }
  } else {
    importModalRef.value?.setResults(result);
  }
};

const handleImportRetry = () => {
  // For prototype, we don't store the file, so we just let them try again.
  console.log('Retry requested');
};

const handleNodeSelected = (data) => {
  if (!data) {
    selectedId.value = null;
    selectedItem.value = null;
    return;
  }
  selectedId.value = data.id;
  selectedItem.value = {
    itemKind: 'node',
    ...data
  };

  // Auto drill-down when user clicks a company on the active layer.
  if (data.type === 'company' && data.layerId === activeLayerId.value) {
    void extendFromCompany({ itemKind: 'node', ...data });
  }
};

const handleEdgeSelected = (data) => {
  if (!data) {
    selectedId.value = null;
    selectedItem.value = null;
    return;
  }
  selectedId.value = data.id;
  selectedItem.value = {
    itemKind: 'edge',
    ...data
  };
};

const resetSelection = () => {
  selectedId.value = null;
  selectedItem.value = null;
};

const setSelectionById = (nodeId) => {
  if (!nodeId) {
    resetSelection();
    return;
  }

  const activeLayer = activeLayerId.value;
  const element = elements.value.find((item) => {
    if (!item?.data) return false;
    if (item.data.id === nodeId) return true;
    return item.data.layerId === activeLayer && item.data.originalId === nodeId;
  });
  if (!element || !element.data) {
    selectedId.value = nodeId;
    selectedItem.value = null;
    return;
  }

  selectedId.value = nodeId;

  if (element.data.source && element.data.target) {
    selectedItem.value = {
      itemKind: 'edge',
      ...element.data
    };
    return;
  }

  selectedItem.value = {
    itemKind: 'node',
    ...element.data
  };
};

const formatRiskLevel = (level) => {
  if (level === 'high') return '高';
  if (level === 'medium-high') return '中高';
  if (level === 'medium') return '中';
  return '低';
};

const getRiskLevelClass = (level) => {
  if (level === 'high') return 'level-high';
  if (level === 'medium-high') return 'level-medium-high';
  if (level === 'medium') return 'level-medium';
  return 'level-low';
};

const getRiskMeterWidth = (score, list) => {
  const maxScore = Number(list?.[0]?.score) || 1;
  const numericScore = Number(score) || 0;
  const scaled = Math.round((numericScore / maxScore) * 100);
  return Math.max(8, Math.min(100, scaled));
};

const focusRiskNode = (nodeId) => {
  setSelectionById(nodeId);
};

const runLayout = () => {
  graphRef.value?.runLayout();
};

const handleSearchKeydown = async (event) => {
  if (event.key === 'Enter') {
    await runSearch();
  }
};
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="brand-block">
        <p class="brand-kicker">INTELLIGENCE MAP</p>
        <h1>上市櫃董監事關係圖</h1>
      </div>
      <div class="actions">
        <button @click="openImportModal" class="btn-import">匯入資料</button>
        <button @click="runLayout" class="btn-secondary">重新佈局</button>
        <button @click="handleClearDatabase" class="btn-danger">清除資料</button>
      </div>
    </header>

    <main class="app-main">
      <div class="graph-area">
        <div v-if="error" class="error-overlay">
          <p>錯誤: {{ error }}</p>
        </div>
        <div v-else-if="!hasSearched" class="loading-overlay search-entry-overlay state-overlay-enter">
          <div class="search-entry-card animated-card-rise">
            <h2>先搜尋，再載入圖形</h2>
            <p>請輸入關鍵字後再載入資料；命中後會自動延伸同名經理人在其他公司的職務。</p>
            <div class="search-entry-row">
              <input
                v-model="searchKeyword"
                type="text"
                class="search-input"
                placeholder="輸入姓名 / 公司代號 / 公司名稱 / 職稱"
                @keydown="handleSearchKeydown"
              />
              <button class="btn-search" @click="runSearch">搜尋載入</button>
            </div>
            <p v-if="searchNotice" class="search-notice notice-glow">{{ searchNotice }}</p>
          </div>
        </div>
        <div v-else-if="!isLoaded || isSearching || isExtending" class="loading-overlay">
          <p>{{ loadingMessage }}</p>
        </div>
        <GraphContainer 
          v-else
          ref="graphRef"
          :elements="elements" 
          :selected-id="selectedId"
          layout-name="cose"
          @node-selected="handleNodeSelected"
          @edge-selected="handleEdgeSelected"
        />
      </div>

      <aside class="info-panel">
        <div class="panel-header">檢視資訊</div>
        <div class="panel-content">
          <div class="search-box-panel">
            <div class="status-row">
              <span class="label">關鍵字搜尋:</span>
            </div>
            <div class="search-entry-row">
              <input
                v-model="searchKeyword"
                type="text"
                class="search-input"
                placeholder="輸入關鍵字"
                @keydown="handleSearchKeydown"
              />
              <button class="btn-search" @click="runSearch">搜尋</button>
            </div>
            <p v-if="searchNotice" class="search-notice notice-glow">{{ searchNotice }}</p>
          </div>

          <div class="system-status">
            <div class="status-row" v-if="layerTrail.length > 0">
              <span class="label">延伸層級:</span>
              <span class="value">第 {{ layerTrail.length }} 層</span>
            </div>
            <div class="status-row" v-if="layerTrail.length > 0">
              <span class="label">層級路徑:</span>
              <span class="value layer-trail">{{ layerTrail.map(item => item.label).join(' → ') }}</span>
            </div>
            <div class="status-row">
              <span class="label">網站儲存總用量:</span>
              <span class="value">{{ (storageUsage / (1024 * 1024)).toFixed(2) }} MB</span>
            </div>
            <div class="status-row" v-if="indexedDbUsage !== null">
              <span class="label">IndexedDB 估算用量:</span>
              <span class="value">{{ (indexedDbUsage / (1024 * 1024)).toFixed(2) }} MB</span>
            </div>
            <div class="status-row" v-else>
              <span class="label">IndexedDB 估算用量:</span>
              <span class="value">目前瀏覽器未提供細項</span>
            </div>
            <div class="status-row">
              <span class="label">資料總筆數:</span>
              <span class="value">{{ totalRecordsCount }}</span>
            </div>
            <div class="status-row" v-if="totalRecordsCount === 0">
              <span class="label">清除狀態:</span>
              <span class="value">資料已清空；總用量可能包含其他快取</span>
            </div>
            <div class="status-row">
              <span class="label">目前圖形載入:</span>
              <span class="value">{{ visualizedRecordsCount }}</span>
            </div>
            <div v-if="visualizedRecordsCount >= MAX_GRAPH_RECORDS" class="status-row">
              <span class="label">提示:</span>
              <span class="value">已達單次載入上限 {{ MAX_GRAPH_RECORDS }} 筆，請縮小關鍵字範圍。</span>
            </div>
          </div>

          <div v-if="selectedItem" class="detail-card">
            <h3>{{ selectedItem.itemKind === 'node' ? 'Node' : 'Edge' }} 詳情</h3>
            <div class="detail-row">
              <span class="label">ID:</span>
              <span class="value">{{ selectedItem.id }}</span>
            </div>
            
            <template v-if="selectedItem.itemKind === 'node'">
              <div v-if="selectedItem.type === 'company'" class="detail-row">
                <span class="label">公司代號:</span>
                <span class="value">{{ selectedItem.companyCode }}</span>
              </div>
              <div v-else-if="selectedItem.type === 'person'" class="detail-row">
                <span class="label">姓名:</span>
                <span class="value">{{ selectedItem.name || selectedItem.label }}</span>
              </div>
              <div class="detail-row">
                <span class="label">名稱:</span>
                <span class="value">{{ selectedItem.label }}</span>
              </div>

              <template v-if="selectedItem.type === 'person'">
                <div class="detail-row">
                  <span class="label">持股股數 (最大):</span>
                  <span class="value">{{ selectedItem.holdingSharesText || '0' }}</span>
                </div>
                <div class="detail-row">
                  <span class="label">職稱:</span>
                  <span class="value">{{ selectedItem.titleText || '無' }}</span>
                </div>
              </template>

              <template v-if="selectedItem.type === 'company'">
                <div class="detail-row">
                  <span class="label">所在層級:</span>
                  <span class="value">第 {{ selectedItem.layerDepth || 1 }} 層</span>
                </div>
                <button
                  class="btn-extend"
                  :disabled="isSearching || isExtending"
                  @click="extendFromCompany"
                >
                  {{ isExtending ? '延伸中...' : '延伸此公司關係圖' }}
                </button>
              </template>
            </template>

            <template v-else-if="selectedItem.itemKind === 'edge'">
              <div class="detail-row">
                <span class="label">職稱:</span>
                <span class="value">{{ selectedItem.title }}</span>
              </div>
            </template>
          </div>
          <div v-else class="empty-state">
            <p>請點擊圖形中的節點或邊以查看詳情</p>
          </div>

          <div class="risk-radar-panel">
            <h3>風險雷達（搜尋範圍）</h3>

            <div class="risk-section">
              <div class="risk-title">人物風險 Top 10</div>
              <ul v-if="personRiskTop.length > 0" class="risk-list">
                <li
                  v-for="person in personRiskTop"
                  :key="person.id"
                  class="risk-item"
                  @click="focusRiskNode(person.id)"
                >
                  <div class="risk-head">
                    <span class="risk-name">{{ person.name }}</span>
                    <span class="risk-score">{{ person.score }}</span>
                  </div>
                  <div class="risk-meter" role="presentation">
                    <span
                      class="risk-meter-fill"
                      :class="getRiskLevelClass(person.level)"
                      :style="{ width: getRiskMeterWidth(person.score, personRiskTop) + '%' }"
                    ></span>
                  </div>
                  <div class="risk-meta">
                    <span class="risk-level-pill" :class="getRiskLevelClass(person.level)">等級: {{ formatRiskLevel(person.level) }}</span>
                    <span>關聯公司: {{ person.companyCount }}</span>
                    <span>設質比: {{ person.pledgeRatio }}%</span>
                  </div>
                </li>
              </ul>
              <p v-else class="risk-empty">尚無可計算資料</p>
            </div>

            <div class="risk-section">
              <div class="risk-title">公司風險 Top 10</div>
              <ul v-if="companyRiskTop.length > 0" class="risk-list">
                <li
                  v-for="company in companyRiskTop"
                  :key="company.id"
                  class="risk-item"
                  @click="focusRiskNode(company.id)"
                >
                  <div class="risk-head">
                    <span class="risk-name">{{ company.companyName }} ({{ company.companyCode }})</span>
                    <span class="risk-score">{{ company.score }}</span>
                  </div>
                  <div class="risk-meter" role="presentation">
                    <span
                      class="risk-meter-fill"
                      :class="getRiskLevelClass(company.level)"
                      :style="{ width: getRiskMeterWidth(company.score, companyRiskTop) + '%' }"
                    ></span>
                  </div>
                  <div class="risk-meta">
                    <span class="risk-level-pill" :class="getRiskLevelClass(company.level)">等級: {{ formatRiskLevel(company.level) }}</span>
                    <span>關聯人物: {{ company.personCount }}</span>
                  </div>
                </li>
              </ul>
              <p v-else class="risk-empty">尚無可計算資料</p>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <ImportModal 
      ref="importModalRef"
      :show="isImportModalOpen"
      title="匯入 CSV 資料"
      @close="closeImportModal"
      @start-import="handleImportFile"
      @retry="handleImportRetry"
    />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap');

:root {
  --bg-main: #f3efe6;
  --bg-elevated: #fbf8f2;
  --bg-panel: #ffffff;
  --ink-strong: #1f2a30;
  --ink-normal: #39484e;
  --ink-muted: #6a7a81;
  --line-soft: #ddd4c3;
  --line-strong: #b9a88f;
  --accent-main: #d4552d;
  --accent-strong: #aa3d1c;
  --danger-main: #b64329;
  --success-main: #2f6d5f;
  --shadow-soft: 0 12px 28px rgba(55, 41, 21, 0.12);
  --shadow-deep: 0 18px 42px rgba(34, 22, 8, 0.2);
}

body, html {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: radial-gradient(circle at 8% 12%, #f8f3ea 0%, var(--bg-main) 42%, #ebe4d5 100%);
  color: var(--ink-normal);
  font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
}

.app-layout {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  animation: appReveal 500ms ease-out;
}

.app-header {
  min-height: 72px;
  background: linear-gradient(120deg, #252f34 0%, #2d3a40 52%, #35464c 100%);
  color: #f6f1e8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  border-bottom: 1px solid rgba(255, 230, 200, 0.16);
  box-shadow: 0 6px 18px rgba(14, 18, 22, 0.35);
}

.brand-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.brand-kicker {
  margin: 0;
  font-family: 'Lexend', sans-serif;
  font-size: 0.68rem;
  letter-spacing: 0.15em;
  color: #c9b79b;
}

.app-header h1 {
  margin: 0;
  font-family: 'Lexend', 'Noto Sans TC', sans-serif;
  font-size: 1.12rem;
  letter-spacing: 0.02em;
  color: #f6efe2;
}

.app-header .actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-import {
  height: 34px;
  padding: 0 14px;
  background: linear-gradient(120deg, #df6039 0%, #cc4f29 100%);
  color: #fff9f4;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
  box-shadow: 0 7px 16px rgba(164, 70, 41, 0.35);
}

.btn-import:hover {
  background: linear-gradient(120deg, #e86a43 0%, #d45831 100%);
}

.btn-danger {
  height: 34px;
  padding: 0 13px;
  background: rgba(182, 67, 41, 0.12);
  color: #f0b9ab;
  border: 1px solid rgba(220, 137, 117, 0.45);
  border-radius: 999px;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
}

.btn-danger:hover {
  background: rgba(182, 67, 41, 0.2);
}

.btn-secondary {
  height: 34px;
  padding: 0 13px;
  border-radius: 999px;
  border: 1px solid rgba(237, 218, 188, 0.36);
  background: rgba(255, 246, 227, 0.09);
  color: #f3e7d3;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary:hover {
  background: rgba(255, 246, 227, 0.2);
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
}

.graph-area {
  flex: 1;
  position: relative;
  min-width: 0;
  background: linear-gradient(140deg, #eee7d8 0%, #f3ebde 26%, #e6ddcc 100%);
}

.info-panel {
  width: clamp(260px, 26vw, 360px);
  flex: 0 0 clamp(260px, 26vw, 360px);
  min-width: 260px;
  background: linear-gradient(180deg, rgba(255, 252, 247, 0.98) 0%, rgba(251, 244, 232, 0.98) 100%);
  border-left: 1px solid var(--line-strong);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.7), -8px 0 24px rgba(80, 66, 47, 0.08);
}

.panel-header {
  padding: 15px 16px;
  font-family: 'Lexend', 'Noto Sans TC', sans-serif;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: #2e3a3f;
  background: rgba(255, 244, 226, 0.84);
  border-bottom: 1px solid var(--line-soft);
}

.panel-content {
  padding: 14px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.system-status {
  margin-bottom: 14px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.75);
  box-shadow: var(--shadow-soft);
}

.status-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 0;
}

.status-row .label {
  font-size: 0.72rem;
  color: var(--ink-muted);
}

.status-row .value {
  font-weight: 600;
  color: var(--ink-strong);
}

.layer-trail {
  font-size: 0.8rem;
  line-height: 1.35;
}

.search-box-panel {
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: rgba(255, 252, 247, 0.85);
  box-shadow: var(--shadow-soft);
}

.search-entry-overlay {
  text-align: center;
}

.search-entry-card {
  width: min(680px, 92%);
  background: linear-gradient(160deg, rgba(255, 250, 242, 0.98) 0%, rgba(248, 238, 220, 0.96) 100%);
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  padding: 22px;
  box-shadow: var(--shadow-deep);
}

.animated-card-rise {
  animation: cardRiseIn 420ms cubic-bezier(0.2, 0.74, 0.26, 1);
}

.state-overlay-enter {
  animation: overlayFadeIn 300ms ease;
}

.search-entry-card h2 {
  margin: 0 0 8px;
  font-family: 'Lexend', 'Noto Sans TC', sans-serif;
  font-size: 1.24rem;
  color: var(--ink-strong);
}

.search-entry-card p {
  margin: 0 0 12px;
  color: var(--ink-normal);
}

.search-entry-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 38px;
  border: 1px solid #ccbda7;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 0.9rem;
  background: rgba(255, 255, 255, 0.88);
  color: var(--ink-strong);
}

.search-input:focus {
  outline: 2px solid rgba(212, 85, 45, 0.35);
  outline-offset: 1px;
}

.btn-search {
  height: 38px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(120deg, #d5572f 0%, #b94825 100%);
  color: #fff7f0;
  padding: 0 12px;
  cursor: pointer;
  font-weight: 700;
}

.btn-search:hover {
  background: linear-gradient(120deg, #e06038 0%, #c7512c 100%);
}

.search-notice {
  margin-top: 8px;
  font-size: 0.85rem;
  color: #785942;
}

.notice-glow {
  animation: noticeSoftPulse 2.2s ease-in-out infinite;
}

.detail-card {
  border: 1px solid var(--line-soft);
  padding: 13px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.75);
  box-shadow: var(--shadow-soft);
}

.detail-row {
  margin-bottom: 9px;
  display: flex;
  flex-direction: column;
}

.detail-row .label {
  font-size: 0.8rem;
  color: var(--ink-muted);
}

.detail-row .value {
  font-weight: 600;
  color: var(--ink-strong);
}

.btn-extend {
  margin-top: 8px;
  height: 34px;
  border: none;
  border-radius: 8px;
  padding: 0 12px;
  background: linear-gradient(120deg, #d5572f 0%, #b94825 100%);
  color: #fff8f2;
  font-weight: 700;
  cursor: pointer;
}

.btn-extend:disabled {
  background: #c5bdaf;
  cursor: not-allowed;
}

.empty-state {
  color: var(--ink-muted);
  text-align: center;
  margin-top: 50px;
}

.risk-radar-panel {
  margin-bottom: 14px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: var(--shadow-soft);
}

.risk-radar-panel h3 {
  margin: 0 0 10px;
  font-family: 'Lexend', 'Noto Sans TC', sans-serif;
  font-size: 0.9rem;
  color: var(--ink-strong);
}

.risk-section {
  margin-bottom: 10px;
}

.risk-title {
  font-size: 0.82rem;
  color: var(--ink-muted);
  margin-bottom: 6px;
}

.risk-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.risk-item {
  border: 1px solid #e2d7c4;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  background: linear-gradient(170deg, rgba(255, 255, 255, 0.95) 0%, rgba(250, 245, 236, 0.85) 100%);
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.risk-item:hover {
  border-color: #c98e6f;
  box-shadow: 0 9px 18px rgba(133, 86, 42, 0.16);
  transform: translateY(-1px);
}

.risk-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.risk-name {
  font-size: 0.84rem;
  color: var(--ink-strong);
}

.risk-score {
  font-weight: 700;
  color: var(--accent-main);
}

.risk-meta {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--ink-muted);
}

.risk-meter {
  margin-top: 6px;
  height: 7px;
  width: 100%;
  border-radius: 999px;
  background: #ece1cf;
  overflow: hidden;
}

.risk-meter-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 220ms ease;
}

.risk-level-pill {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}

.level-high {
  background: linear-gradient(120deg, #e0633b 0%, #bf4924 100%);
  color: #fff6f0;
}

.level-medium-high {
  background: linear-gradient(120deg, #e99645 0%, #cf6f2b 100%);
  color: #fff8ef;
}

.level-medium {
  background: linear-gradient(120deg, #d5ad54 0%, #bf9333 100%);
  color: #fff9ef;
}

.level-low {
  background: linear-gradient(120deg, #5f8f7f 0%, #406f61 100%);
  color: #eefbf5;
}

.risk-empty {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.8rem;
}

.error-overlay, .loading-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(247, 241, 231, 0.84);
  color: var(--ink-strong);
}

@keyframes appReveal {
  from {
    opacity: 0;
    transform: translateY(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes cardRiseIn {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes noticeSoftPulse {
  0%, 100% {
    opacity: 0.88;
    text-shadow: 0 0 0 rgba(212, 85, 45, 0);
  }
  50% {
    opacity: 1;
    text-shadow: 0 0 12px rgba(212, 85, 45, 0.18);
  }
}

@media (max-width: 920px) {
  .app-header {
    align-items: flex-start;
    gap: 10px;
    flex-direction: column;
    padding-bottom: 12px;
  }

  .app-header .actions {
    width: 100%;
  }

  .app-main {
    flex-direction: column;
  }

  .info-panel {
    width: 100%;
    min-width: 0;
    flex: 0 0 42%;
    max-height: 42%;
    border-left: none;
    border-top: 1px solid var(--line-strong);
  }
}
</style>
