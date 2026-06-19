## TODO

本檔用於追蹤尚未完成事項。

### Backlog
- [ ] Loop 2: 大檔案交易性能與索引調優 (IndexedDB Transaction)
- [ ] Loop 3: 多層次圖形關聯渲染 (Cytoscape.js)
- [ ] Loop 4: 整合型混合匯入與狀態 UI (Vue 3 SFC)
- [ ] Loop 5: 品質、相容性與效能硬化回圈 (分批匯入與 Safari 驗證)

### In Progress
- [ ] Loop 1: 核心資料清洗與 edgeKey 增量合併驗證
  - [ ] 1. 建立原生 IndexedDB 結構 (relationships & metadata)
  - [ ]    驗收：可建立/讀取兩個 store，且升級流程不清庫
  - [ ] 2. 撰寫 deterministic edgeKey 拼接函式 (trim & 全半形處理)
  - [ ]    驗收：相同輸入永遠產生相同 edgeKey，不同公司同名可區分
  - [ ] 3. 實作平坦 JSON 轉 Edge 物件清洗演算法 (處理本人與法人代表)
  - [ ]    驗收：可輸出標準化欄位與來源資訊，錯誤列可回報
  - [ ] 4. 執行 1,000 筆樣本資料的 Upsert 斷言測試 (驗證無重複插入)
  - [ ]    驗收：重複匯入時 inserted=0，updated 與差異一致
  - [ ] 5. 定義 personNodeKey 規則並完成同名跨公司分離測試
  - [ ]    驗收：圖形層同名不同公司不誤合併

### Done
1. [x] 完成專案 Working Rules 與 Code Style 規範定義
2. [x] 通過開發主計劃 (DEVELOPMENT_PLAN.md) 評審