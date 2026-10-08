// Types for the Emscripten module built from rtadvanced/src/wasm/bridge.cpp.
export interface RendererBModule {
  ccall(name: string, returnType: 'number' | 'string' | null, argTypes: string[], args: unknown[]): number;
  UTF8ToString(pointer: number): string;
  HEAPU32: Uint32Array;
  HEAPF32: Float32Array;
  FS: { writeFile(path: string, data: string): void; readFile(path: string, options: { encoding: 'utf8' }): string };
}

declare function createModule(options?: object): Promise<RendererBModule>;
export default createModule;
