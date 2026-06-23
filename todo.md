## TODO

本檔用於追蹤尚未完成事項。

### Backlog
- [ ] Loop 6: UAT 與上線回圈

## Loop 5 完成工作項

### 交付物清單
- [x] **分批匯入策略優化**
  - 實現 BatchOptimizer (自適應批次大小調整)
  - 動態進度回報機制
  - 性能監控與日誌記錄
  
- [x] **交易失敗錯誤處理加強**
  - 詳細錯誤追踪 (errorDetails 陣列)
  - 記錄層級驗證
  - 部分成功保留與恢復機制

- [x] **跨瀏覽器驗證清單**
  - 建立 BROWSER_COMPATIBILITY.md
  - 驗證矩陣 (Chrome, Safari, Edge, Firefox)
  - 已知限制與規避措施

- [x] **效能基準測試與報告**
  - 8 項性能測試用例
  - 達成所有 Loop 5 KPI
  - 詳細性能基準報告 (LOOP5_PERFORMANCE_REPORT.md)

### 驗收條件通過
- [x] 10,000 筆匯入 < 3 秒 (實測: 420ms)
- [x] 50,000 筆匯入 < 15 秒 (實測: 2,426ms)
- [x] 關鍵字搜尋 < 300ms (實測: 38ms)
- [x] 無記憶體線性增長 (驗證: 穩定)
- [x] 交易失敗錯誤處理正確 (驗證: 通過)

### 文件交付
- [x] BROWSER_COMPATIBILITY.md - 跨瀏覽器驗證清單
- [x] LOOP5_PERFORMANCE_REPORT.md - 性能基準報告
- [x] batch-optimizer.js - 批次優化模組
- [x] import-service.js - 改進的匯入服務
- [x] db.js - 增強的數據庫錯誤處理
- [x] loop5-performance-benchmark.test.js - 性能測試套件

### In Progress

### Done
1. [x] 完成專案 Working Rules 與 Code Style 規範定義
2. [x] 通過開發主計劃 (DEVELOPMENT_PLAN.md) 評審
3. [x] Loop 0: 問題定義與資料契約凍結
4. [x] Loop 1: 匯入管線最小可用版 (含 CSV parser, Edge clean, IndexedDB upsert)
5. [x] Loop 2: IndexedDB Schema 與增量合併核心測試與驗證
6. [x] Loop 3: 多層次圖形關聯渲染 (Cytoscape.js)
  - [x] 1. 環境與圖形基礎架構 (Infrastructure)
  - [x] 2. 資料轉換管線 (Data Transformation Pipeline)
  - [x] 3. 基本交互與渲染 (Rendering & Interaction)
7. [x] Loop 4: 整合型混合匯入與狀態 UI (Vue 3 SFC)
8. [x] Loop 5: 品質、相容性與效能硬化回圈 (分批匯入與 Safari 驗證)
  - [x] 1. 增強交易失敗錯誤處理
  - [x] 2. 優化分批匯入策略 (BatchOptimizer)
  - [x] 3. 建立跨瀏覽器驗證清單
  - [x] 4. 執行效能基準測試與報告
