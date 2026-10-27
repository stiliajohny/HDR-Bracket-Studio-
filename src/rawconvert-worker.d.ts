declare module 'rawconvert-wasm/dist/worker-client.js' {
  export const RawConvertWorker: {
    init(options: {
      workerUrl: string;
      coreUrl: string;
      wasmUrl: string;
    }): Promise<{
      load(data: ArrayBuffer, filename: string): Promise<unknown>;
      process(options?: Record<string, unknown>): Promise<{
        width: number;
        height: number;
        data: Uint8Array | ArrayBuffer;
      }>;
      reset(): Promise<void>;
      dispose(): void;
    }>;
  };
}
