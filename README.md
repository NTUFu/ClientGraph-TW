# ClientGraph-TW

上市櫃董監事關係圖（純前端專案）。

此專案提供 CSV 匯入、IndexedDB 增量合併、關鍵字搜尋、關係圖視覺化與風險雷達分析，並支援多層關係延伸瀏覽。

## 專案特色

- 純前端架構（Vue 3 + Vite），可離線操作
- 原生 IndexedDB 儲存，重整頁面資料不遺失
- 匯入採增量 upsert，不清空既有資料
- 搜尋支援姓名、公司代號、公司名稱、職稱
- 圖形支援節點/邊選取、鄰接高亮、滑鼠提示
- 公司節點可向下延伸關係圖，前一層自動淡化
- 側欄顯示風險雷達 Top 10（人物/公司）
- 支援 GitHub Pages 自動部署

## 技術堆疊

- Vue 3
- Vite 5
- Cytoscape.js
- Vitest
- fake-indexeddb（測試用）

## 專案結構

- src/
  - App.vue：主頁面、搜尋流程、延伸層級管理
  - components/graph/GraphContainer.vue：Cytoscape 視覺化與互動
  - components/ImportModal.vue：匯入流程 UI
  - utils/db.js：IndexedDB schema 與查詢/寫入
  - utils/import-service.js：匯入整合流程
  - utils/parser.js：CSV/JSON 解析與清洗
  - utils/graph-transformer.js：資料轉 Cytoscape elements
  - utils/risk-radar.js：風險雷達計算
- tests/：單元與效能測試
- samplefile/：範例資料（上市/上櫃）

## 快速開始

### 1) 安裝依賴

    npm install

### 2) 啟動開發伺服器

    npm run dev

### 3) 建置正式版

    npm run build

### 4) 執行測試

    npm test

## 使用流程

1. 點擊「匯入資料」
2. 選擇來源（上市 / 上櫃）
3. 上傳 CSV 檔案
4. 匯入完成後輸入關鍵字搜尋
5. 點選公司節點可延伸下一層關係圖
6. 點選節點或邊查看右側詳情

## 資料與合併規則

- 主要鍵：edgeKey = normalize(姓名) + | + normalize(公司代號) + | + normalize(職稱)
- 匯入策略：使用 put() upsert
- 相同 edgeKey：以新資料覆蓋舊資料
- 不同 edgeKey：與既有資料並存
- metadata 累積：latestDataMonth、sourceTypes、sourceSummary、importCount

## npm scripts

- npm run dev：本機開發
- npm run build：建置 production
- npm run preview：預覽 production build
- npm test：執行 Vitest 測試
- npm run test:watch：測試監看模式
- npm run lint：ESLint 修正

## GitHub Pages 部署

本專案已包含自動部署設定。

- Workflow 檔案：.github/workflows/deploy-pages.yml
- 觸發條件：push 到 main 或手動執行 workflow_dispatch

請確認以下設定：

1. Repository 已啟用 Actions
2. Repository Settings > Pages > Source 選擇 GitHub Actions
3. 以 main 分支作為發布來源（若你使用其他分支，請調整 workflow）

部署後網址通常為：

https://<你的帳號>.github.io/<你的repo名稱>/

## 瀏覽器支援

詳細請見 BROWSER_COMPATIBILITY.md。

建議優先使用：

- Chrome 90+
- Safari 14+
- Edge 90+

## 測試現況

測試包含：

- IndexedDB 邏輯
- 解析與資料清洗
- 關係圖轉換
- 風險雷達計算
- 效能基準

## 開發規範與文件

- 協作規則：WORKING_RULES.md
- 開發計畫：DEVELOPMENT_PLAN.md
- 程式風格：CODE_STYLE.md
- 待辦清單：todo.md

## 已知限制

- 大量節點下，圖形佈局可能因視覺密度降低可讀性
- 前端 Bundle 體積偏大，build 會有 chunk size 警告
- Safari 在 IndexedDB 容量與交易行為上有額外限制

## License

目前尚未指定授權條款（All rights reserved by default）。
