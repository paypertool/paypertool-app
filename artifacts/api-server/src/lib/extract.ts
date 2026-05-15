import OpenAI from "openai";
import { scrapeUrl } from "./scrape";

export type ExtractResult = {
  url: string;
  finalUrl: string;
  schema: Record<string, unknown>;
  data: Record<string, unknown>;
  model: string;
  promptTokens: number;
  completionTokens: number;
  fetchedAt: string;
};

export class ExtractError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

const MODEL = process.env["EXTRACT_MODEL"] ?? "gpt-5-nano";
const MAX_MARKDOWN_CHARS = 60_000;
const LLM_TIMEOUT_MS = 60_000;

export function isExtractEnabled(): boolean {
  return Boolean(
    process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ??
      process.env["OPENAI_API_KEY"],
  );
}

let cached: OpenAI | null = null;
function getClient(): OpenAI {
  if (cached) return cached;
  const baseURL =
    process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ??
    process.env["OPENAI_BASE_URL"] ??
    "https://api.openai.com/v1";
  const apiKey =
    process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ??
    process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new ExtractError(
      "OpenAI not configured (set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY)",
      500,
    );
  }
  cached = new OpenAI({ baseURL, apiKey });
  return cached;
}

function normalizeSchema(schema: unknown): Record<string, unknown> {
  if (
    !schema ||
    typeof schema !== "object" ||
    Array.isArray(schema)
  ) {
    throw new ExtractError(
      "'schema' must be a JSON Schema object describing the output shape",
      400,
    );
  }
  return schema as Record<string, unknown>;
}

export async function extractData(
  rawUrl: string,
  schema: unknown,
  instructions?: string,
): Promise<ExtractResult> {
  const normalizedSchema = normalizeSchema(schema);

  let scraped;
  try {
    scraped = await scrapeUrl(rawUrl);
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      const e = err as { status: number; message: string };
      throw new ExtractError(`Failed to fetch source: ${e.message}`, e.status);
    }
    throw new ExtractError("Failed to fetch source page", 502);
  }

  const truncated = scraped.markdown.slice(0, MAX_MARKDOWN_CHARS);
  const wasTruncated = scraped.markdown.length > MAX_MARKDOWN_CHARS;

  const systemPrompt =
    "You extract structured data from web pages. Read the user-provided " +
    "page content and return a single JSON object that strictly matches " +
    "the supplied JSON schema. If a field is unknown, use null. Never " +
    "invent facts not present in the content. Respond with ONLY the JSON " +
    "object, no prose, no markdown fences.\n\n" +
    "Required JSON schema:\n" +
    JSON.stringify(normalizedSchema, null, 2);

  const userPrompt = [
    instructions ? `Extraction goal: ${instructions}` : null,
    `Source URL: ${scraped.finalUrl}`,
    `Page title: ${scraped.title ?? "(none)"}`,
    wasTruncated
      ? `(Content truncated to ${MAX_MARKDOWN_CHARS} chars.)`
      : null,
    "",
    "--- PAGE CONTENT (markdown) ---",
    truncated,
  ]
    .filter(Boolean)
    .join("\n");

  const client = getClient();

  let completion;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
  try {
    completion = await client.chat.completions.create(
      {
        model: MODEL,
        max_completion_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      },
      { signal: ac.signal },
    );
  } catch (err) {
    if (ac.signal.aborted) {
      throw new ExtractError("Extraction timed out", 504);
    }
    const msg = err instanceof Error ? err.message : "LLM call failed";
    throw new ExtractError(`Extraction failed: ${msg}`, 502);
  } finally {
    clearTimeout(timer);
  }

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new ExtractError("LLM returned empty response", 502);
  }

  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ExtractError(
        "LLM returned non-object JSON; expected a single object matching schema",
        502,
      );
    }
    data = parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    throw new ExtractError("LLM returned invalid JSON", 502);
  }

  return {
    url: rawUrl,
    finalUrl: scraped.finalUrl,
    schema: normalizedSchema,
    data,
    model: completion.model,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    fetchedAt: new Date().toISOString(),
  };
}
