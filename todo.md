## TODO

本檔用於追蹤尚未完成事項。

### Backlog
- [ ] Loop 6: UAT 與 Launch 準備
- [ ] 跨瀏覽器完整驗證 (Chrome / Safari / Edge / Firefox)
- [ ] 上線前驗收腳本與操作手冊整理

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
8. [x] Loop 5: 品質、相容性與效能硬化回圈
  - [x] 大資料量搜尋優化 (search-first + cursor limit)
  - [x] 圖形佈局與標籤重疊改善 (adaptive layout)
  - [x] 匯入流程修正 (0% 卡住、OK 關閉失效)
9. [x] 介面文字更新：網站名稱改為「上市櫃董監事關係圖」
10. [x] 匯入視窗新增資料下載指引與官方連結
11. [x] 新增清除資料功能（刪除 IndexedDB 後重建）
12. [x] 修正清除資料 blocked 連線問題（集中關閉連線後刪除）
13. [x] 儲存容量顯示改版（區分網站總用量與 IndexedDB 估算用量）
14. [x] 新增風險雷達（以搜尋結果計算人物/公司 Top 10，並可點擊定位節點）