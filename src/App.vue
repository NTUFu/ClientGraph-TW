<script setup>
import { ref, onMounted } from 'vue';
import GraphContainer from './components/graph/GraphContainer.vue';
import ImportModal from './components/ImportModal.vue';
import { openDB, getMetadata, getRecordsByKeyword, getRecordsByNames, getRelationshipsCount, clearDatabase } from './utils/db.js';
import { transformRecordsToElements } from './utils/graph-transformer.js';
import { ImportService } from './utils/import-service.js';

const graphRef = ref(null);
const elements = ref([]);
const selectedId = ref(null);
const selectedItem = ref(null);
const isLoaded = ref(false);
const error = ref(null);
const storageUsage = ref(0);
const loadingMessage = ref('請輸入關鍵字搜尋');
const totalRecordsCount = ref(0);
const visualizedRecordsCount = ref(0);
const searchKeyword = ref('');
const hasSearched = ref(false);
const isSearching = ref(false);
const searchNotice = ref('');

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
      storageUsage.value = estimate.usage;
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

const runSearch = async () => {
  const keyword = searchKeyword.value.trim();
  if (!keyword) {
    searchNotice.value = '請先輸入關鍵字 (姓名 / 公司代號 / 公司名稱 / 職稱)。';
    return;
  }

  try {
    isSearching.value = true;
    isLoaded.value = false;
    hasSearched.value = true;
    error.value = null;
    loadingMessage.value = '正在搜尋資料...';

    const db = await openDB();
    const baseRecords = await getRecordsByKeyword(db, keyword, MAX_BASE_RECORDS);

    // One-hop expansion: if a matched manager has roles in other companies, include them too.
    let expandedRecords = [];
    if (baseRecords.length > 0) {
      loadingMessage.value = '正在擴展關聯公司職務...';
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
    visualizedRecordsCount.value = records.length;
    elements.value = transformRecordsToElements(records);

    if (records.length === 0) {
      searchNotice.value = '查無資料，請更換關鍵字再試一次。';
    } else if (records.length >= MAX_GRAPH_RECORDS) {
      searchNotice.value = `已載入上限 ${MAX_GRAPH_RECORDS} 筆（含跨公司延伸），請輸入更精準關鍵字。`;
    } else {
      const expandedCount = Math.max(0, records.length - baseRecords.length);
      searchNotice.value = `已載入 ${records.length} 筆（關鍵字命中 ${baseRecords.length} 筆，跨公司延伸 ${expandedCount} 筆）。`;
    }

    isLoaded.value = true;
  } catch (err) {
    console.error('Failed to search data:', err);
    error.value = err.message;
  } finally {
    isSearching.value = false;
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
    
    // Reopen database to reinitialize it
    const newDb = await openDB();
    
    // Reset page state
    elements.value = [];
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
    type: 'Node',
    ...data
  };
};

const handleEdgeSelected = (data) => {
  if (!data) {
    selectedId.value = null;
    selectedItem.value = null;
    return;
  }
  selectedId.value = data.id;
  selectedItem.value = {
    type: 'Edge',
    ...data
  };
};

const resetSelection = () => {
  selectedId.value = null;
  selectedItem.value = null;
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
      <h1>上市櫃董監事關係圖</h1>
      <div class="actions">
        <button @click="openImportModal" class="btn-import">匯入資料</button>
        <button @click="runLayout">重新佈局</button>
        <button @click="handleClearDatabase" class="btn-danger">清除資料</button>
      </div>
    </header>

    <main class="app-main">
      <div class="graph-area">
        <div v-if="error" class="error-overlay">
          <p>錯誤: {{ error }}</p>
        </div>
        <div v-else-if="!hasSearched" class="loading-overlay search-entry-overlay">
          <div class="search-entry-card">
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
            <p v-if="searchNotice" class="search-notice">{{ searchNotice }}</p>
          </div>
        </div>
        <div v-else-if="!isLoaded || isSearching" class="loading-overlay">
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
            <p v-if="searchNotice" class="search-notice">{{ searchNotice }}</p>
          </div>

          <div class="system-status">
            <div class="status-row">
              <span class="label">IndexedDB 容量:</span>
              <span class="value">{{ (storageUsage / (1024 * 1024)).toFixed(2) }} MB</span>
            </div>
            <div class="status-row">
              <span class="label">資料總筆數:</span>
              <span class="value">{{ totalRecordsCount }}</span>
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
            <h3>{{ selectedItem.type }} 詳情</h3>
            <div class="detail-row">
              <span class="label">ID:</span>
              <span class="value">{{ selectedItem.id }}</span>
            </div>
            
            <template v-if="selectedItem.type === 'Node'">
              <div v-if="selectedItem.type === 'company'" class="detail-row">
                <span class="label">公司代號:</span>
                <span class="value">{{ selectedItem.companyCode }}</span>
              </div>
              <div class="detail-row">
                <span class="label">名稱:</span>
                <span class="value">{{ selectedItem.label }}</span>
              </div>
            </template>

            <template v-else-if="selectedItem.type === 'Edge'">
              <div class="detail-row">
                <span class="label">職稱:</span>
                <span class="value">{{ selectedItem.title }}</span>
              </div>
            </template>
          </div>
          <div v-else class="empty-state">
            <p>請點擊圖形中的節點或邊以查看詳情</p>
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
/* Global Styles */
body, html {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-layout {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
}

.app-header {
  height: 60px;
  background: #2c3e50;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.app-header h1 {
  margin: 0;
  font-size: 1.2rem;
}

.app-header .actions {
  display: flex;
  gap: 10px;
}

.btn-import {
  padding: 6px 12px;
  background: #27ae60;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.85rem;
}

.btn-import:hover {
  background: #2ecc71;
}

.btn-danger {
  padding: 6px 12px;
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.85rem;
}

.btn-danger:hover {
  background: #c0392b;
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.graph-area {
  flex: 1;
  position: relative;
}

.info-panel {
  width: 300px;
  background: #fff;
  border-left: 1px solid #ddd;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 15px;
  font-weight: bold;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
}

.panel-content {
  padding: 15px;
  flex: 1;
}

.system-status {
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.status-row {
  display: flex;
  flex-direction: column;
}

.status-row .label {
  font-size: 0.75rem;
  color: #777;
}

.status-row .value {
  font-weight: 500;
}

.search-box-panel {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid #e6e6e6;
  border-radius: 6px;
  background: #fafafa;
}

.search-entry-overlay {
  text-align: center;
}

.search-entry-card {
  width: min(680px, 92%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}

.search-entry-card h2 {
  margin: 0 0 8px;
  font-size: 1.25rem;
}

.search-entry-card p {
  margin: 0 0 12px;
  color: #4b5563;
}

.search-entry-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 0.9rem;
}

.btn-search {
  height: 36px;
  border: none;
  border-radius: 6px;
  background: #0f766e;
  color: #fff;
  padding: 0 12px;
  cursor: pointer;
  font-weight: 600;
}

.btn-search:hover {
  background: #0d9488;
}

.search-notice {
  margin-top: 8px;
  font-size: 0.85rem;
  color: #374151;
}

.detail-card {
  border: 1px solid #eee;
  padding: 15px;
  border-radius: 4px;
}

.detail-row {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
}

.detail-row .label {
  font-size: 0.8rem;
  color: #777;
}

.detail-row .value {
  font-weight: 500;
}

.empty-state {
  color: #999;
  text-align: center;
  margin-top: 50px;
}

.error-overlay, .loading-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.8);
}
</style>
