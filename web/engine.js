// The same ABI wrapper is exercised by the Node tests and by the browser worker.
export async function execute(module, source, input = '') {
  const instance = await WebAssembly.instantiate(module, {});
  const api = instance.exports;
  const encoder = new TextEncoder();
  const sourceBytes = encoder.encode(source);
  const inputBytes = encoder.encode(input);
  const sourcePointer = api.allocate(sourceBytes.length);
  const inputPointer = api.allocate(inputBytes.length);
  try {
    new Uint8Array(api.memory.buffer).set(sourceBytes, sourcePointer);
    new Uint8Array(api.memory.buffer).set(inputBytes, inputPointer);
    const pointer = api.run(sourcePointer, sourceBytes.length, inputPointer, inputBytes.length);
    const result = new TextDecoder().decode(new Uint8Array(api.memory.buffer, pointer, api.result_length()));
    return JSON.parse(result);
  } finally {
    api.release(sourcePointer, sourceBytes.length);
    api.release(inputPointer, inputBytes.length);
  }
}
