/**
 * Web Worker 包装器
 * 管理与 CSV 解析 Worker 的通信，提供 Promise 接口
 */
import type { DataRow, Field } from '../types';

export interface WorkerParseProgress {
  phase: 'parsing' | 'preprocessing';
  progress: number;
  rowCount: number;
}

export interface WorkerParseResult {
  headers: string[];
  fields: Field[];
  data: DataRow[];
  rowCount: number;
}

export async function parseCSVWithWorker(
  file: File,
  onProgress?: (progress: WorkerParseProgress) => void
): Promise<WorkerParseResult> {
  // 动态加载国家映射
  let countryMapping: Record<string, string> = {};
  try {
    const mod = await import('../data/countryMapping.json');
    countryMapping = mod.default;
  } catch {
    // 映射文件不存在时跳过
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/csvWorker.ts', import.meta.url), {
      type: 'module',
    });

    const timeout = setTimeout(
      () => {
        worker.terminate();
        reject(new Error('文件解析超时'));
      },
      10 * 60 * 1000
    ); // 10 分钟超时

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;

      if (msg.type === 'progress') {
        onProgress?.({
          phase: msg.phase,
          progress: msg.progress,
          rowCount: msg.rowCount,
        });
        return;
      }

      if (msg.type === 'done') {
        clearTimeout(timeout);
        worker.terminate();
        resolve({
          headers: msg.headers,
          fields: msg.fields,
          data: msg.data,
          rowCount: msg.rowCount,
        });
        return;
      }

      if (msg.type === 'error') {
        clearTimeout(timeout);
        worker.terminate();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(err.message || 'Worker 启动失败'));
    };

    // 将文件作为 ArrayBuffer 传递给 Worker
    file.arrayBuffer().then((buffer) => {
      worker.postMessage({ fileBuffer: buffer, countryMapping }, [buffer]);
    });
  });
}
