import { config } from "../config.js";
import { logger } from "../logger.js";

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream: false;
  images?: string[];
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export class OllamaClient {
  private baseUrl: string;
  private model: string;

  constructor(
    baseUrl: string = config.ollamaUrl,
    model: string = config.ollamaModel
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generate(
    prompt: string,
    options?: {
      system?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    const body: OllamaGenerateRequest = {
      model: this.model,
      prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.1,
        num_predict: options?.maxTokens ?? 2048,
      },
    };

    if (options?.system) {
      body.system = options.system;
    }

    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000), // 2 min timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Ollama API error (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as OllamaGenerateResponse;
    const duration = Date.now() - startTime;

    logger.info(
      {
        model: this.model,
        durationMs: duration,
        evalTokens: data.eval_count,
        responseLength: data.response.length,
      },
      "Ollama generation completed"
    );

    return data.response;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async isModelAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;

      const data = (await response.json()) as {
        models: Array<{ name: string }>;
      };
      return data.models.some(
        (m) => m.name === this.model || m.name.startsWith(`${this.model}:`)
      );
    } catch {
      return false;
    }
  }
}

// Singleton instance
let client: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!client) {
    client = new OllamaClient();
  }
  return client;
}

// ---------------------------------------------------------------------------
// Vision LLM client — uses ollamaVisionModel (e.g. qwen2-vl)
// ---------------------------------------------------------------------------

export class VisionOllamaClient {
  private baseUrl: string;
  private model: string;

  constructor(
    baseUrl: string = config.ollamaUrl,
    model: string = config.ollamaVisionModel
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  /**
   * Send a prompt together with a base64-encoded image to the vision model.
   * @param prompt  The text prompt describing what to extract
   * @param imageBase64  Raw base64-encoded PNG/JPEG data (no data-URI prefix)
   * @param options  Optional temperature / maxTokens overrides
   */
  async generateWithImage(
    prompt: string,
    imageBase64: string,
    options?: {
      system?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    const body: OllamaGenerateRequest = {
      model: this.model,
      prompt,
      images: [imageBase64],
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.1,
        num_predict: options?.maxTokens ?? 2048,
      },
    };

    if (options?.system) {
      body.system = options.system;
    }

    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000), // 3 min — vision models are slower
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Ollama Vision API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OllamaGenerateResponse;
    const duration = Date.now() - startTime;

    logger.info(
      {
        model: this.model,
        durationMs: duration,
        evalTokens: data.eval_count,
        responseLength: data.response.length,
      },
      "Ollama vision generation completed"
    );

    return data.response;
  }

  async isModelAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;

      const data = (await response.json()) as {
        models: Array<{ name: string }>;
      };
      return data.models.some(
        (m) => m.name === this.model || m.name.startsWith(`${this.model}:`)
      );
    } catch {
      return false;
    }
  }
}

let visionClient: VisionOllamaClient | null = null;

export function getVisionOllamaClient(): VisionOllamaClient {
  if (!visionClient) {
    visionClient = new VisionOllamaClient();
  }
  return visionClient;
}
