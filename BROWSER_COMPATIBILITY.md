# 跨瀏覽器驗證清單 (Browser Compatibility Checklist)

本檔案定義 Loop 5 的瀏覽器相容性驗證規範。

## 目標瀏覽器與支援版本

| 瀏覽器 | 最低版本 | 測試狀態 | 備註 |
|--------|---------|---------|------|
| Chrome | 90+ | 測試中 | 生產環境首選 |
| Safari | 14+ | 待測 | iOS/macOS, IndexedDB 支援有限 |
| Edge | 90+ | 待測 | Chromium 基礎 |
| Firefox | 88+ | 待測 | 可選 |

## 核心功能相容性驗證矩陣

### 1. IndexedDB 操作相容性

**測試項目**

- [ ] **Chrome**: 
  - [ ] 資料庫建立與 Schema 初始化 ✓
  - [ ] 分批 upsert 交易成功 
  - [ ] metadata 累積更新正確 
  - [ ] 資料持久化與重新整理保留 
  - [ ] 錯誤恢復機制

- [ ] **Safari**:
  - [ ] 資料庫建立與 Schema 初始化 
  - [ ] 分批 upsert 交易成功 (Safari 交易限制測試)
  - [ ] metadata 累積更新正確 
  - [ ] 資料持久化與重新整理保留 
  - [ ] 私密瀏覽模式下 IndexedDB 可用性

- [ ] **Edge**:
  - [ ] 資料庫建立與 Schema 初始化 
  - [ ] 分批 upsert 交易成功 
  - [ ] metadata 累積更新正確 
  - [ ] 資料持久化與重新整理保留 

- [ ] **Firefox**:
  - [ ] 資料庫建立與 Schema 初始化 
  - [ ] 分批 upsert 交易成功 
  - [ ] metadata 累積更新正確 
  - [ ] 資料持久化與重新整理保留 

### 2. 檔案匯入相容性

**測試項目**

- [ ] **CSV 解析**
  - [ ] Chrome: 正確解析 BOM, LF, CRLF ✓
  - [ ] Safari: 正確解析 BOM, LF, CRLF 
  - [ ] Edge: 正確解析 BOM, LF, CRLF 
  - [ ] Firefox: 正確解析 BOM, LF, CRLF 

- [ ] **JSON 解析**
  - [ ] Chrome: 正確解析 UTF-8, 大檔案 ✓
  - [ ] Safari: 正確解析 UTF-8, 大檔案 
  - [ ] Edge: 正確解析 UTF-8, 大檔案 
  - [ ] Firefox: 正確解析 UTF-8, 大檔案 

- [ ] **檔案選取對話框**
  - [ ] Chrome: 支援多檔案、檔案篩選 ✓
  - [ ] Safari: 支援多檔案、檔案篩選 
  - [ ] Edge: 支援多檔案、檔案篩選 
  - [ ] Firefox: 支援多檔案、檔案篩選 

### 3. Vue 3 / Vite 構建相容性

**測試項目**

- [ ] **ES Module 支援**
  - [ ] Chrome: import/export ✓
  - [ ] Safari: import/export 
  - [ ] Edge: import/export 
  - [ ] Firefox: import/export 

- [ ] **Async/Await**
  - [ ] Chrome: 可靠運行 ✓
  - [ ] Safari: 可靠運行 
  - [ ] Edge: 可靠運行 
  - [ ] Firefox: 可靠運行 

- [ ] **Promise**
  - [ ] Chrome: 完整支援 ✓
  - [ ] Safari: 完整支援 
  - [ ] Edge: 完整支援 
  - [ ] Firefox: 完整支援 

- [ ] **Map/Set/WeakMap**
  - [ ] Chrome: 完整支援 ✓
  - [ ] Safari: 完整支援 
  - [ ] Edge: 完整支援 
  - [ ] Firefox: 完整支援 

### 4. 搜尋與 Cursor 相容性

**測試項目**

- [ ] **IDBCursor 遍歷**
  - [ ] Chrome: 支援 continue/advance ✓
  - [ ] Safari: 支援 continue/advance 
  - [ ] Edge: 支援 continue/advance 
  - [ ] Firefox: 支援 continue/advance 

- [ ] **Index 查詢**
  - [ ] Chrome: 支援多 index 複合查詢 ✓
  - [ ] Safari: 支援多 index 複合查詢 
  - [ ] Edge: 支援多 index 複合查詢 
  - [ ] Firefox: 支援多 index 複合查詢 

### 5. UI/UX 相容性

**測試項目**

- [ ] **進度條顯示**
  - [ ] Chrome: 流暢渲染 ✓
  - [ ] Safari: 流暢渲染 
  - [ ] Edge: 流暢渲染 
  - [ ] Firefox: 流暢渲染 

- [ ] **錯誤訊息展示**
  - [ ] Chrome: 清晰可讀 ✓
  - [ ] Safari: 清晰可讀 
  - [ ] Edge: 清晰可讀 
  - [ ] Firefox: 清晰可讀 

- [ ] **響應式布局**
  - [ ] Chrome (各尺寸): 正確 ✓
  - [ ] Safari (各尺寸): 正確 
  - [ ] Edge (各尺寸): 正確 
  - [ ] Firefox (各尺寸): 正確 

## 已知限制與規避措施

### Safari 特殊處理

1. **IndexedDB 容量限制**
   - Safari 限制為 ~50MB/origin
   - 規避：分次匯入大檔案，監控容量

2. **私密瀏覽限制**
   - Safari 私密模式下 IndexedDB 可用但數據不持久
   - 提示：提醒使用者在一般瀏覽中使用本功能

3. **交易超時**
   - Safari 交易可能逾時 (> 24 小時)
   - 規避：增小批次大小，分次提交

### Firefox 特殊處理

1. **Blob.text() 可能延遲**
   - Firefox 大檔案文字轉換較慢
   - 規避：使用 streaming 讀取

## 效能基準 (瀏覽器差異)

| 操作 | Chrome | Safari | Edge | Firefox | 目標 |
|------|--------|--------|------|---------|------|
| 匯入 10,000 筆 | <2s | <3s | <2s | <3s | <3s |
| 匯入 50,000 筆 | <10s | <15s | <10s | <15s | <15s |
| 關鍵字搜尋 (50k 資料) | <150ms | <300ms | <150ms | <300ms | <300ms |

## 驗證流程

### 手動驗證步驟 (每個瀏覽器)

1. **初始化檢查**
   ```javascript
   // 在瀏覽器主控台執行
   const db = await openDB();
   console.log('DB opened:', db.name, db.version);
   ```

2. **匯入測試**
   - 選擇 `samplefile/上市.json` 進行匯入
   - 觀察進度條更新流暢度
   - 檢查匯入統計數字正確

3. **重新整理持久性檢查**
   - 匯入成功後重新整理頁面
   - 確認資料仍存在於 IndexedDB

4. **搜尋測試**
   - 執行姓名搜尋
   - 執行公司代號搜尋
   - 確認結果正確且回應時間 < 300ms

5. **錯誤處理檢查**
   - 故意匯入格式錯誤的檔案
   - 確認錯誤訊息清晰且使用者可讀

### 自動化驗證 (Vitest + jsdom/happy-dom)

```bash
npm test
```

**測試涵蓋項目**
- [ ] IndexedDB upsert 邏輯
- [ ] 解析器 (CSV/JSON)
- [ ] metadata 累積
- [ ] 關鍵字搜尋

## 報告模板

### 單一瀏覽器驗證報告

**瀏覽器**: Chrome 120.0  
**日期**: 2024-XX-XX  
**測試者**: [名稱]

| 測試項目 | 結果 | 耗時 | 備註 |
|---------|------|------|------|
| 匯入 10k 筆 | ✓ | 1.8s | 流暢 |
| 資料持久化 | ✓ | - | 重新整理後仍存在 |
| 搜尋效能 | ✓ | 120ms | 50k 資料集 |
| 錯誤提示 | ✓ | - | 訊息清晰 |

**結論**: 可用 ✓  
**阻擋缺陷**: 無  
**主要缺陷**: 無  
**次要缺陷**: 無  

## 上線前驗收清單

在上線前，需完成以下檢查：

- [ ] Chrome 完整驗證通過
- [ ] Safari 基本功能可用（沒有阻擋缺陷）
- [ ] Edge 基本功能可用（沒有阻擋缺陷）
- [ ] 所有浏覽器錯誤訊息文案已審核
- [ ] 效能基準已記錄
- [ ] 已知限制已文件化並提示給使用者

## 相關連結

- [MDN IndexedDB 相容性表](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Can I use - IndexedDB](https://caniuse.com/indexeddb)
- [WebKit IndexedDB 狀態](https://webkit.org/status/#specification-indexeddb-level-2)
