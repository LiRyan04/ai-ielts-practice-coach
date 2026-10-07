interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta: Record<string, unknown>;
  error?: string;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

interface R2ObjectBody {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    TTS_AUDIO?: R2Bucket;
    ACCOUNT_DATA_ENCRYPTION_KEY?: string;
		DASHSCOPE_API_KEY?: string;
		MIMO_API_KEY?: string;
    OPENAI_API_KEY?: string;
    DEEPGRAM_API_KEY?: string;
    DEEPGRAM_TTS_MODEL?: string;
    QWEN_TTS_MODEL?: string;
    QWEN_TTS_VOICE?: string;
    [key: string]: unknown;
  };
}
