export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type SearchResponse = {
  query: string;
  provider: "serper";
  results: SearchResult[];
  fetchedAt: string;
};

export class SearchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SearchError";
  }
}

const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 10;

export function isSearchEnabled(): boolean {
  return Boolean(process.env["SERPER_API_KEY"]);
}

type SerperOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
};

type SerperApiResponse = {
  organic?: SerperOrganicResult[];
};

export async function searchWeb(
  query: string,
  limit: number = MAX_RESULTS,
): Promise<SearchResponse> {
  const apiKey = process.env["SERPER_API_KEY"];
  if (!apiKey) {
    throw new SearchError(
      "Search backend not configured (missing SERPER_API_KEY)",
      503,
    );
  }

  const trimmed = query.trim();
  if (!trimmed) throw new SearchError("Empty query", 400);
  if (trimmed.length > 500) throw new SearchError("Query too long", 400);
  const cap = Math.min(Math.max(1, Math.floor(limit) || MAX_RESULTS), MAX_RESULTS);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({ q: trimmed, num: cap }),
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : "fetch failed";
    throw new SearchError(`Search backend failed: ${msg}`, 502);
  }
  clearTimeout(timeout);

  if (response.status === 401 || response.status === 403) {
    throw new SearchError("Search backend rejected API key", 503);
  }
  if (response.status === 429) {
    throw new SearchError("Search backend rate-limited", 503);
  }
  if (!response.ok) {
    throw new SearchError(
      `Search backend returned ${response.status}`,
      502,
    );
  }

  const body = (await response.json()) as SerperApiResponse;
  const raw = body.organic ?? [];
  const results: SearchResult[] = raw
    .filter(
      (r): r is { title: string; link: string; snippet?: string } =>
        typeof r.title === "string" && typeof r.link === "string",
    )
    .slice(0, cap)
    .map((r) => ({
      title: r.title,
      url: r.link,
      snippet: typeof r.snippet === "string" ? r.snippet : "",
    }));

  if (results.length === 0) {
    // Returning 404 prevents x402-express from settling the payment,
    // so the buyer is not charged for an empty result set.
    throw new SearchError("No results found for query", 404);
  }

  return {
    query: trimmed,
    provider: "serper",
    results,
    fetchedAt: new Date().toISOString(),
  };
}
