import { parseCSVGenerator, cleanAndStandardizeGenerator } from './parser.js';
import { openDB, upsertRecords } from './db.js';
import { BatchOptimizer } from './batch-optimizer.js';

/**
 * Service to orchestrate the full import pipeline.
 * Handles file parsing, data cleaning, chunked upsert, and performance monitoring.
 */
export class ImportService {
  constructor() {
    this.db = null;
    this.batchOptimizer = null;
  }

  /**
   * Ensures the database connection is initialized.
   */
  async init() {
    if (!this.db) {
      this.db = await openDB();
    }
  }

  /**
   * Orchestrates the CSV import process using a generator-based pipeline for memory efficiency.
   * Includes adaptive batch optimization for performance tuning.
   * 
   * @param {File} file - The CSV file from an input element.
   * @param {string} sourceType - The source identifier ('上市', '上櫃', etc.).
   * @param {Function} onProgress - A callback function (progressData) => void.
   * @returns {Promise<Object>} A summary object containing success status and statistics.
   */
  async importCSV(file, sourceType = 'unknown', onProgress = () => {}) {
    try {
      await this.init();
      
      // Initialize batch optimizer for this import session
      this.batchOptimizer = new BatchOptimizer(500);
      
      // 1. Reading File
      onProgress({ stage: 'parsing', progress: 0.1, message: '正在讀取檔案...' });
      const text = await file.text();
      
      // 2. Parsing & Cleaning (Generator-based)
      onProgress({ stage: 'parsing', progress: 0.3, message: '正在解析 CSV 格式與清洗資料...' });
      
      const csvGenerator = parseCSVGenerator(text);
      
      // Bridge generator to convert rows to objects
      const rawRecordsGenerator = (function* () {
        const headers = [];
        let isFirst = true;
        for (const row of csvGenerator) {
          if (isFirst) {
            row.forEach(h => headers.push(h.trim()));
            isFirst = false;
            continue;
          }
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = index < row.length ? row[index] : '';
          });
          yield obj;
        }
      })();

      const cleaningGenerator = cleanAndStandardizeGenerator(rawRecordsGenerator, sourceType);

      // 3. Processing & Saving (Chunked with optimization)
      onProgress({ stage: 'cleaning', progress: 0.5, message: '正在準備寫入資料...' });

      const stats = {
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: 0
      };
      const cleaningErrors = [];
      const chunkUpsertErrors = [];
      let totalRaw = 0;
      let totalValid = 0;
      
      let currentChunk = [];
      let chunkStartTime = 0;

      for (const [record, error] of cleaningGenerator) {
        totalRaw++;
        
        if (error) {
          cleaningErrors.push(error);
          stats.errors++;
          continue;
        }

        if (record) {
          totalValid++;
          currentChunk.push(record);

          // Use dynamic chunk size from optimizer
          const currentChunkSize = this.batchOptimizer.getCurrentChunkSize();
          
          if (currentChunk.length === currentChunkSize) {
            // Track chunk performance
            chunkStartTime = performance.now();
            
            onProgress({ 
              stage: 'saving', 
              progress: 0.5 + (0.4 * Math.min(totalValid / 10000, 1.0)),
              message: `正在儲存第 ${totalValid} 筆資料 (批次大小: ${currentChunkSize})...` 
            });

            try {
              const chunkStats = await upsertRecords(this.db, currentChunk, currentChunkSize);
              
              stats.inserted += chunkStats.inserted;
              stats.updated += chunkStats.updated;
              stats.skipped += chunkStats.skipped;
              stats.errors += chunkStats.errors;
              
              // Capture detailed chunk errors if available
              if (chunkStats.errorDetails && chunkStats.errorDetails.length > 0) {
                chunkUpsertErrors.push(...chunkStats.errorDetails);
              }
              
              // Record chunk performance and adjust batch size
              const chunkTimeMs = performance.now() - chunkStartTime;
              const optimizationApplied = this.batchOptimizer.recordChunkCompletion(
                chunkTimeMs,
                currentChunk.length
              );
              
              if (optimizationApplied) {
                const newChunkSize = this.batchOptimizer.getCurrentChunkSize();
                console.log(`Batch size adjusted: ${currentChunkSize} → ${newChunkSize} (took ${chunkTimeMs.toFixed(2)}ms)`);
              }
            } catch (chunkErr) {
              // Transaction failure captured with original error context
              onProgress({
                stage: 'error',
                progress: 0.5 + (0.4 * Math.min(totalValid / 10000, 1.0)),
                message: `交易失敗: ${chunkErr.message || '未知錯誤'}`
              });
              
              // Preserve partial progress before throwing
              return {
                success: false,
                error: chunkErr.message || 'Transaction failed',
                partialStats: stats,
                originalError: chunkErr,
                totalRaw,
                totalValid,
                cleaningErrors,
                chunkUpsertErrors,
                batchMetrics: this.batchOptimizer.getMetrics()
              };
            }

            currentChunk = [];
          }
        }
      }

      // Process the last remaining chunk
      if (currentChunk.length > 0) {
        chunkStartTime = performance.now();
        onProgress({ 
          stage: 'saving', 
          progress: 0.95, 
          message: `正在儲存最後 ${currentChunk.length} 筆資料...` 
        });
        
        try {
          const chunkStats = await upsertRecords(this.db, currentChunk, currentChunk.length);
          stats.inserted += chunkStats.inserted;
          stats.updated += chunkStats.updated;
          stats.skipped += chunkStats.skipped;
          stats.errors += chunkStats.errors;
          
          if (chunkStats.errorDetails && chunkStats.errorDetails.length > 0) {
            chunkUpsertErrors.push(...chunkStats.errorDetails);
          }
          
          const chunkTimeMs = performance.now() - chunkStartTime;
          this.batchOptimizer.recordChunkCompletion(chunkTimeMs, currentChunk.length);
        } catch (chunkErr) {
          onProgress({
            stage: 'error',
            progress: 0.95,
            message: `最後一批交易失敗: ${chunkErr.message || '未知錯誤'}`
          });
          
          return {
            success: false,
            error: chunkErr.message || 'Transaction failed on final chunk',
            partialStats: stats,
            originalError: chunkErr,
            totalRaw,
            totalValid,
            cleaningErrors,
            chunkUpsertErrors,
            batchMetrics: this.batchOptimizer.getMetrics()
          };
        }
      }

      // 4. Completion
      onProgress({ stage: 'completed', progress: 1.0, message: '匯入流程順利完成！' });

      return {
        success: true,
        stats,
        cleaningErrors,
        chunkUpsertErrors,
        totalRaw,
        totalValid,
        batchMetrics: this.batchOptimizer.getSummary()
      };

    } catch (err) {
      onProgress({ 
        stage: 'error', 
        progress: 0, 
        message: err.message || '匯入流程發生未預期錯誤' 
      });
      return {
        success: false,
        error: err.message || 'Unexpected error during import',
        originalError: err
      };
    }
  }
}
