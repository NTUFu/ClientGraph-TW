<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  show: Boolean,
  title: {
    type: String,
    default: '匯入資料'
  }
});

const emit = defineEmits(['close', 'start-import', 'retry']);

// Import State
const isProcessing = ref(false);
const progress = ref(0);
const statusMessage = ref('');
const stage = ref('idle'); // idle | parsing | cleaning | saving | completed | error

// Selection State
const selectedFile = ref(null);
const selectedSource = ref('上市');

// Results State
const results = ref(null); // { stats, cleaningErrors, totalRaw, totalValid, metadata }
const error = ref(null);

const reset = () => {
  isProcessing.value = false;
  progress.value = 0;
  statusMessage.value = '';
  stage.value = 'idle';
  results.value = null;
  error.value = null;
  selectedFile.value = null;
  selectedSource.value = '上市';
};

const prepareForImport = () => {
  isProcessing.value = true;
  progress.value = 0;
  statusMessage.value = '準備開始匯入...';
  stage.value = 'parsing';
  results.value = null;
  error.value = null;
};

const handleFileSelect = (event) => {
  const file = event.target.files[0];
  if (file) {
    selectedFile.value = file;
  }
};

const close = () => {
  reset();
  emit('close');
};

// Methods called by parent to update progress
const updateProgress = (progressData) => {
  const { stage: newStage, progress: newProgress, message } = progressData;
  stage.value = newStage;
  progress.value = newProgress;
  statusMessage.value = message;

  if (newStage === 'completed') {
    isProcessing.value = false;
  } else if (newStage === 'error') {
    isProcessing.value = false;
    error.value = message;
  }
};

const setResults = (importResult) => {
  if (importResult.success) {
    results.value = importResult;
    stage.value = 'completed';
    isProcessing.value = false;
  } else {
    error.value = importResult.error;
    isProcessing.value = false;
    stage.value = 'error';
  }
};

const handleStartImport = () => {
  if (!selectedFile.value) {
    alert('請先選擇檔案');
    return;
  }

  // Keep selected file/source for parent import handler.
  prepareForImport();
  emit('start-import', { file: selectedFile.value, sourceType: selectedSource.value });
};

const handleCloseResult = () => {
  close();
};

const handleRetry = () => {
  prepareForImport();
  // The parent will need to re-trigger the import
  emit('retry');
};

// Computed
const progressPercentage = computed(() => Math.round(progress.value * 100));
const fileSelectedName = computed(() => selectedFile.value ? selectedFile.value.name : '');

// Expose methods to parent component
defineExpose({
  updateProgress,
  setResults,
  reset
});
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="modal-overlay" @click.self="close">
      <div class="modal-container">
        <header class="modal-header">
          <h3>{{ title }}</h3>
          <button class="close-btn" @click="close">&times;</button>
        </header>

        <div class="modal-body">
          <!-- 1. Idle / Selection State -->
          <div v-if="stage === 'idle' && !isProcessing" class="selection-area">
            
            <!-- Source Selection -->
            <div class="source-selection">
              <p class="section-title">資料來源</p>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" v-model="selectedSource" value="上市" />
                  上市
                </label>
                <label class="radio-label">
                  <input type="radio" v-model="selectedSource" value="上櫃" />
                  上櫃
                </label>
              </div>
            </div>

            <!-- Data Download Links -->
            <div class="download-info">
              <p class="section-title">資料下載</p>
              <p class="download-desc">請自行下載 CSV 檔案：</p>
              <ul class="download-links">
                <li><a href="https://data.gov.tw/dataset/22811" target="_blank" rel="noopener noreferrer">上市公司董監事資料</a></li>
                <li><a href="https://data.gov.tw/dataset/22812" target="_blank" rel="noopener noreferrer">上櫃公司董監事資料</a></li>
              </ul>
            </div>

            <!-- File Selection -->
            <div class="drop-zone">
              <p v-if="!selectedFile">請選擇 CSV 檔案或將檔案拖曳至此</p>
              <p v-else class="selected-file-name">已選擇: {{ fileSelectedName }}</p>
              <input 
                type="file" 
                accept=".csv" 
                @change="handleFileSelect" 
                id="file-input"
                class="hidden-input"
              />
              <label for="file-input" class="file-label">
                {{ selectedFile ? '重新選擇' : '選擇檔案' }}
              </label>
            </div>
            <p class="hint">支援格式: .csv</p>

            <!-- Import Rules -->
            <div class="rules-info">
              <p class="rules-title">匯入規則說明</p>
              <ul class="rules-list">
                <li>以 <b>edgeKey</b> 為基準進行增量合併 (Upsert)。</li>
                <li>重複匯入相同資料時，僅會更新內容，不會新增重複筆數。</li>
                <li>匯入後將累積 metadata (最新資料年月、來源類型)。</li>
              </ul>
            </div>

            <div class="modal-actions">
              <button 
                class="btn-primary" 
                :disabled="!selectedFile"
                @click="handleStartImport"
              >
                開始匯入
              </button>
            </div>
          </div>

          <!-- 2. Processing State -->
          <div v-if="isProcessing" class="processing-area">
            <div class="spinner"></div>
            <p class="status-text">{{ statusMessage }}</p>
            <div class="progress-bar-container">
              <div class="progress-bar" :style="{ width: progressPercentage + '%' }"></div>
            </div>
            <div class="progress-text">{{ progressPercentage }}%</div>
          </div>

          <!-- 3. Error State (during processing) -->
          <div v-if="stage === 'error' && isProcessing" class="error-area">
            <div class="error-icon">⚠️</div>
            <p class="error-msg">{{ error }}</p>
            <button class="btn-secondary" @click="handleRetry">重試</button>
          </div>

          <!-- 4. Success / Results State -->
          <div v-if="results" class="results-area">
            <div class="success-icon">✅</div>
            <h4>匯入完成！</h4>
            
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-label">原始總列數</span>
                <span class="stat-value">{{ results.totalRaw }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">有效匯入</span>
                <span class="stat-value success">{{ results.totalValid }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">更新筆數</span>
                <span class="stat-value">{{ results.stats.updated }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">新增筆數</span>
                <span class="stat-value">{{ results.stats.inserted }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">跳過筆數</span>
                <span class="stat-value">{{ results.stats.skipped }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">錯誤筆數</span>
                <span class="stat-value danger">{{ results.stats.errors }}</span>
              </div>
            </div>

            <!-- Metadata Summary (NEW for Loop 4) -->
            <div v-if="results.metadata" class="metadata-summary">
              <p class="section-title">資料庫狀態</p>
              <div class="metadata-grid">
                <div class="metadata-item">
                  <span class="label">最新資料年月:</span>
                  <span class="value">{{ results.metadata.latestDataMonth || '無' }}</span>
                </div>
                <div class="metadata-item">
                  <span class="label">包含來源:</span>
                  <span class="value">{{ results.metadata.sourceTypes.join(', ') }}</span>
                </div>
              </div>
            </div>

            <!-- Show cleaning errors if any -->
            <div v-if="results.cleaningErrors && results.cleaningErrors.length > 0" class="errors-summary">
              <p class="errors-title">部分資料清洗錯誤 (跳過):</p>
              <ul class="errors-list">
                <li v-for="(err, idx) in results.cleaningErrors.slice(0, 5)" :key="idx">
                  第 {{ err.row }} 列: {{ err.reason }}
                </li>
                <li v-if="results.cleaningErrors.length > 5" class="more-errors">
                  ... 以及其他 {{ results.cleaningErrors.length - 5 }} 筆錯誤
                </li>
              </ul>
            </div>

            <div class="modal-actions">
              <button class="btn-primary" @click="handleCloseResult">確定</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(29, 36, 40, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  background: linear-gradient(160deg, #fdf8ef 0%, #f6eddc 100%);
  width: 90%;
  max-width: 560px;
  border-radius: 14px;
  border: 1px solid #cfbca0;
  box-shadow: 0 20px 42px rgba(25, 20, 11, 0.3);
  overflow: hidden;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.modal-header {
  padding: 14px 18px;
  border-bottom: 1px solid #d8c9af;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(120deg, #29353b 0%, #35464f 100%);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #f9f1e2;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #dcc9a8;
}

.close-btn:hover {
  color: #fff4dd;
}

.modal-body {
  padding: 24px 18px;
}

/* Selection Area */
.selection-area {
  text-align: center;
}

/* New Styles for Loop 4 */
.source-selection {
  text-align: left;
  margin-bottom: 20px;
}
.section-title {
  font-weight: bold;
  margin-bottom: 8px;
  color: #1f2a30;
}
.radio-group {
  display: flex;
  gap: 20px;
  margin-bottom: 10px;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

/* Download Info */
.download-info {
  text-align: left;
  background: linear-gradient(160deg, #fffaf0 0%, #f6ebd8 100%);
  padding: 13px;
  border-radius: 10px;
  margin-top: 15px;
  margin-bottom: 15px;
  border-left: 4px solid #d4552d;
}

.download-desc {
  margin: 8px 0;
  font-size: 0.95rem;
  color: #3e4b51;
}

.download-links {
  margin: 10px 0 0 0;
  padding-left: 20px;
  list-style-type: disc;
}

.download-links a {
  color: #bc4822;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.3s;
}

.download-links a:hover {
  color: #8f351a;
  text-decoration: underline;
}

.drop-zone {
  border: 2px dashed #ccb89a;
  border-radius: 12px;
  padding: 40px 20px;
  background: rgba(255, 251, 243, 0.78);
  transition: border-color 0.3s;
}

.drop-zone:hover {
  border-color: #d4552d;
}

.hidden-input {
  display: none;
}

.file-label {
  display: inline-block;
  padding: 10px 25px;
  background: linear-gradient(120deg, #d5572f 0%, #ba4824 100%);
  color: white;
  border-radius: 999px;
  cursor: pointer;
  font-weight: bold;
  margin-top: 10px;
  box-shadow: 0 8px 18px rgba(155, 63, 34, 0.32);
}

.selected-file-name {
  margin-bottom: 10px;
  font-weight: bold;
  color: #9b3f22;
}

.hint {
  color: #6b7a80;
  font-size: 0.85rem;
  margin-top: 15px;
}

/* Import Rules */
.rules-info {
  text-align: left;
  background: rgba(255, 252, 246, 0.8);
  padding: 15px;
  border-radius: 10px;
  margin-top: 20px;
  font-size: 0.85rem;
  color: #4f5f65;
  border: 1px solid #e0d2bd;
}
.rules-title {
  font-weight: bold;
  margin-bottom: 5px;
  color: #223037;
}
.rules-list {
  margin: 0;
  padding-left: 20px;
  color: #4f5f65;
}

/* Processing Area */
.processing-area {
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 20px;
  border: 4px solid #eadbc4;
  border-top: 4px solid #cf532c;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.status-text {
  font-weight: 500;
  margin-bottom: 15px;
  color: #2a383e;
}

.progress-bar-container {
  width: 100%;
  height: 10px;
  background: #e8dcc8;
  border-radius: 5px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(120deg, #d5572f 0%, #bd4924 100%);
  transition: width 0.3s ease;
}

.progress-text {
  margin-top: 8px;
  font-size: 0.85rem;
  color: #5f6f76;
}

/* Error Area */
.error-area {
  text-align: center;
}

.error-icon {
  font-size: 2.5rem;
  margin-bottom: 10px;
}

.error-msg {
  color: #b64329;
  margin-bottom: 20px;
}

/* Results Area */
.results-area {
  text-align: center;
}

.success-icon {
  font-size: 3rem;
  margin-bottom: 10px;
}

.results-area h4 {
  margin: 0 0 20px;
  color: #2f6d5f;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 20px;
}

.stat-item {
  background: rgba(255, 255, 255, 0.8);
  padding: 10px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  border: 1px solid #e4d8c6;
}

.stat-label {
  font-size: 0.75rem;
  color: #617178;
}

.stat-value {
  font-size: 1.1rem;
  font-weight: bold;
  color: #223037;
}

.stat-value.success { color: #27ae60; }
.stat-value.danger { color: #b64329; }

/* Metadata Summary (NEW for Loop 4) */
.metadata-summary {
  text-align: left;
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #d8c9af;
}
.metadata-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.metadata-item {
  display: flex;
  flex-direction: column;
}
.metadata-item .label {
  font-size: 0.75rem;
  color: #617178;
}
.metadata-item .value {
  font-size: 0.9rem;
  font-weight: 500;
  color: #243136;
}

/* Show cleaning errors if any */
.errors-summary {
  text-align: left;
  background: #fff1ed;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #f0b6a8;
  margin-bottom: 20px;
}

.errors-title {
  font-size: 0.85rem;
  font-weight: bold;
  color: #a63c24;
  margin: 0 0 5px;
}

.errors-list {
  margin: 0;
  padding-left: 20px;
  font-size: 0.8rem;
  color: #a63c24;
}

.more-errors {
  font-style: italic;
  list-style: none;
  margin-top: 5px;
}

/* Buttons */
.modal-actions {
  margin-top: 20px;
}

.btn-primary {
  padding: 10px 30px;
  background: linear-gradient(120deg, #d5572f 0%, #ba4824 100%);
  color: white;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 8px 18px rgba(155, 63, 34, 0.32);
}

.btn-primary:disabled {
  background: #c5bdaf;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-secondary {
  padding: 8px 20px;
  background: #efe5d4;
  color: #26343a;
  border: 1px solid #d6c5ab;
  border-radius: 999px;
  cursor: pointer;
}

.btn-primary:hover:not(:disabled) { background: linear-gradient(120deg, #df6039 0%, #c54d28 100%); }
.btn-secondary:hover { background: #e3d4bc; }

/* Transitions */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

@media (max-width: 700px) {
  .modal-container {
    width: 94%;
  }

  .stats-grid,
  .metadata-grid {
    grid-template-columns: 1fr;
  }

  .modal-body {
    padding: 18px 14px;
  }
}
</style>
