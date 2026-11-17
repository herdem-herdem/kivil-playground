import { execute } from './engine.js';
self.onmessage = async ({ data }) => {
  try {
    const started = performance.now();
    const result = await execute(data.module, data.source, data.input);
    self.postMessage({ ...result, elapsed: performance.now() - started });
  } catch {
    self.postMessage({ output: '', error: 'Program çalıştırılamadı. Bellek veya çağrı derinliği sınırı aşılmış olabilir.', needsInput: false });
  }
};
