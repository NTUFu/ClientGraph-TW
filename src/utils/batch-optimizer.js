/**
 * Batch Optimizer for adaptive import chunk sizing.
 * 
 * Monitors transaction performance and adjusts chunk size dynamically
 * to balance responsiveness and throughput while respecting browser constraints.
 */

export class BatchOptimizer {
  constructor(initialChunkSize = 500) {
    this.chunkSize = initialChunkSize;
    this.minChunkSize = 100;
    this.maxChunkSize = 2000;
    
    // Performance metrics
    this.metrics = {
      totalChunksProcessed: 0,
      totalTimeMs: 0,
      avgChunkTimeMs: 0,
      fastChunkCount: 0,
      slowChunkCount: 0,
      lastChunkTimeMs: 0,
      peakMemoryMB: 0
    };
    
    // Thresholds for adjustment
    this.thresholds = {
      fastThreshold: 100,    // Chunk completes in < 100ms -> can increase size
      slowThreshold: 500,    // Chunk takes > 500ms -> should decrease size
      targetChunkTimeMs: 200 // Target 200ms per chunk for UI responsiveness
    };
  }

  /**
   * Record chunk completion time and update metrics.
   * 
   * @param {number} chunkTimeMs - Time taken to process and save chunk
   * @param {number} recordCount - Number of records in chunk
   * @returns {boolean} True if optimization adjusted chunk size
   */
  recordChunkCompletion(chunkTimeMs, recordCount) {
    this.metrics.totalChunksProcessed++;
    this.metrics.totalTimeMs += chunkTimeMs;
    this.metrics.lastChunkTimeMs = chunkTimeMs;
    this.metrics.avgChunkTimeMs = this.metrics.totalTimeMs / this.metrics.totalChunksProcessed;

    // Track fast/slow chunks
    if (chunkTimeMs < this.thresholds.fastThreshold) {
      this.metrics.fastChunkCount++;
    } else if (chunkTimeMs > this.thresholds.slowThreshold) {
      this.metrics.slowChunkCount++;
    }

    return this._adjustChunkSizeIfNeeded(chunkTimeMs, recordCount);
  }

  /**
   * Internal: Adjust chunk size based on performance.
   * 
   * @private
   * @param {number} chunkTimeMs - Time taken for last chunk
   * @param {number} recordCount - Records in last chunk
   * @returns {boolean} True if adjustment made
   */
  _adjustChunkSizeIfNeeded(chunkTimeMs, recordCount) {
    const oldChunkSize = this.chunkSize;

    // Strategy: If chunk was too slow, reduce; if very fast, try to increase
    if (chunkTimeMs > this.thresholds.slowThreshold && this.chunkSize > this.minChunkSize) {
      // Reduce chunk size: decrease by 20%
      this.chunkSize = Math.max(
        this.minChunkSize,
        Math.floor(this.chunkSize * 0.8)
      );
    } else if (
      chunkTimeMs < this.thresholds.fastThreshold &&
      this.chunkSize < this.maxChunkSize &&
      this.metrics.fastChunkCount >= 3 // Need consistent fast performance
    ) {
      // Increase chunk size: increase by 10%
      this.chunkSize = Math.min(
        this.maxChunkSize,
        Math.floor(this.chunkSize * 1.1)
      );
    }

    return oldChunkSize !== this.chunkSize;
  }

  /**
   * Get the current optimal chunk size.
   * 
   * @returns {number} Current chunk size
   */
  getCurrentChunkSize() {
    return this.chunkSize;
  }

  /**
   * Get performance metrics snapshot.
   * 
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Calculate estimated time remaining for import.
   * 
   * @param {number} remainingRecordCount - Number of records left to process
   * @returns {number} Estimated milliseconds
   */
  estimateRemainingTimeMs(remainingRecordCount) {
    if (this.metrics.avgChunkTimeMs === 0) {
      return 0;
    }
    const remainingChunks = Math.ceil(remainingRecordCount / this.chunkSize);
    return remainingChunks * this.metrics.avgChunkTimeMs;
  }

  /**
   * Calculate import speed in records per second.
   * 
   * @returns {number} Records per second
   */
  getImportSpeedRps() {
    if (this.metrics.totalTimeMs === 0) {
      return 0;
    }
    const totalRecords = this.metrics.totalChunksProcessed * this.chunkSize;
    return (totalRecords / this.metrics.totalTimeMs) * 1000;
  }

  /**
   * Reset metrics (useful for multi-import scenarios).
   */
  resetMetrics() {
    this.metrics = {
      totalChunksProcessed: 0,
      totalTimeMs: 0,
      avgChunkTimeMs: 0,
      fastChunkCount: 0,
      slowChunkCount: 0,
      lastChunkTimeMs: 0,
      peakMemoryMB: 0
    };
  }

  /**
   * Generate a performance summary for reporting.
   * 
   * @returns {Object} Summary suitable for display or logging
   */
  getSummary() {
    return {
      totalChunksProcessed: this.metrics.totalChunksProcessed,
      totalTimeMs: Math.round(this.metrics.totalTimeMs),
      avgChunkTimeMs: Math.round(this.metrics.avgChunkTimeMs),
      estimatedRps: this.getImportSpeedRps().toFixed(2),
      finalChunkSize: this.chunkSize,
      optimizationRuns: this.metrics.fastChunkCount + this.metrics.slowChunkCount
    };
  }
}
