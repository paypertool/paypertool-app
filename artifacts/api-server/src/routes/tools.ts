import { Router, type IRouter } from "express";
import { ScrapeError, scrapeUrl } from "../lib/scrape";
import { SearchError, isSearchEnabled, searchWeb } from "../lib/search";
import { ScreenshotError, screenshotUrl } from "../lib/screenshot";
import { ExtractError, extractData, isExtractEnabled } from "../lib/extract";
import {
  YoutubeTranscriptError,
  fetchYoutubeTranscript,
} from "../lib/youtube-transcript";
import { OgMetadataError, fetchOgMetadata } from "../lib/og-metadata";
import { EnsResolveError, resolveEns } from "../lib/ens-resolve";
import { GasPriceError, getGasPrice } from "../lib/gas-price";
import { TokenInfoError, getTokenInfo } from "../lib/token-info";
import { RugcheckError, rugcheck } from "../lib/rugcheck";
import {
  AgentMemoryError,
  isAgentMemoryEnabled,
  setMemory,
  getMemory,
} from "../lib/agent-memory";
import { TOOLS, X402_NETWORK, PAY_TO_ADDRESS } from "../lib/x402-config";

const router: IRouter = Router();

router.get("/tools", (_req, res) => {
  res.json({
    network: X402_NETWORK,
    payTo: PAY_TO_ADDRESS,
    tools: TOOLS,
  });
});

router.post("/tools/scrape", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url : null;
  if (!url) {
    res.status(400).json({ error: "Missing 'url' in JSON body" });
    return;
  }

  try {
    const result = await scrapeUrl(url);
    res.json(result);
  } catch (err) {
    if (err instanceof ScrapeError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "scrape_url failed");
    res.status(500).json({ error: "Internal error" });
  }
});

if (isSearchEnabled()) {
  router.post("/tools/search", async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query : null;
  const limit =
    typeof req.body?.limit === "number" ? req.body.limit : undefined;
  if (!query) {
    res.status(400).json({ error: "Missing 'query' in JSON body" });
    return;
  }

  try {
    const result = await searchWeb(query, limit ?? 10);
    res.json(result);
  } catch (err) {
    if (err instanceof SearchError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "search_web failed");
    res.status(500).json({ error: "Internal error" });
  }
});
}

router.post("/tools/screenshot", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url : null;
  const width =
    typeof req.body?.width === "number" ? req.body.width : undefined;
  const height =
    typeof req.body?.height === "number" ? req.body.height : undefined;
  if (!url) {
    res.status(400).json({ error: "Missing 'url' in JSON body" });
    return;
  }

  try {
    const result = await screenshotUrl(url, width ?? 1280, height ?? 800);
    res.json(result);
  } catch (err) {
    if (err instanceof ScreenshotError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "screenshot failed");
    res.status(500).json({ error: "Internal error" });
  }
});

if (isExtractEnabled()) {
  router.post("/tools/extract", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url : null;
  const schema = req.body?.schema;
  const instructions =
    typeof req.body?.instructions === "string"
      ? req.body.instructions
      : undefined;
  if (!url) {
    res.status(400).json({ error: "Missing 'url' in JSON body" });
    return;
  }
  if (!schema || typeof schema !== "object") {
    res.status(400).json({ error: "Missing 'schema' (JSON Schema object)" });
    return;
  }

  try {
    const result = await extractData(url, schema, instructions);
    res.json(result);
  } catch (err) {
    if (err instanceof ExtractError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "extract_data failed");
    res.status(500).json({ error: "Internal error" });
  }
});
}

router.post("/tools/youtube-transcript", async (req, res) => {
  const videoUrl =
    typeof req.body?.videoUrl === "string" ? req.body.videoUrl : null;
  const language =
    typeof req.body?.language === "string" ? req.body.language : undefined;
  if (!videoUrl) {
    res.status(400).json({ error: "Missing 'videoUrl' in JSON body" });
    return;
  }
  try {
    const result = await fetchYoutubeTranscript(videoUrl, language);
    res.json(result);
  } catch (err) {
    if (err instanceof YoutubeTranscriptError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "youtube_transcript failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tools/og-metadata", async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url : null;
  if (!url) {
    res.status(400).json({ error: "Missing 'url' in JSON body" });
    return;
  }
  try {
    const result = await fetchOgMetadata(url);
    res.json(result);
  } catch (err) {
    if (err instanceof OgMetadataError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "og_metadata failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tools/ens-resolve", async (req, res) => {
  const input = typeof req.body?.input === "string" ? req.body.input : null;
  if (!input) {
    res
      .status(400)
      .json({ error: "Missing 'input' (ENS name or 0x address) in JSON body" });
    return;
  }
  try {
    const result = await resolveEns(input);
    res.json(result);
  } catch (err) {
    if (err instanceof EnsResolveError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "ens_resolve failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tools/gas-price", async (req, res) => {
  const chain = typeof req.body?.chain === "string" ? req.body.chain : null;
  if (!chain) {
    res.status(400).json({ error: "Missing 'chain' in JSON body" });
    return;
  }
  try {
    const result = await getGasPrice(chain);
    res.json(result);
  } catch (err) {
    if (err instanceof GasPriceError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "gas_price failed");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tools/rugcheck", async (req, res) => {
  const chain = typeof req.body?.chain === "string" ? req.body.chain : null;
  const address =
    typeof req.body?.address === "string" ? req.body.address : null;
  if (!chain || !address) {
    res
      .status(400)
      .json({ error: "Missing 'chain' or 'address' in JSON body" });
    return;
  }
  try {
    const result = await rugcheck(chain, address);
    res.json(result);
  } catch (err) {
    if (err instanceof RugcheckError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "rugcheck failed");
    res.status(500).json({ error: "Internal error" });
  }
});

if (isAgentMemoryEnabled()) {
  router.post("/tools/memory-set", async (req, res) => {
    const namespace = req.body?.namespace;
    const key = req.body?.key;
    const value = req.body?.value;
    const ttlSeconds =
      typeof req.body?.ttlSeconds === "number"
        ? req.body.ttlSeconds
        : undefined;
    try {
      const result = await setMemory({ namespace, key, value, ttlSeconds });
      res.json(result);
    } catch (err) {
      if (err instanceof AgentMemoryError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "agent_memory_set failed");
      res.status(500).json({ error: "Internal error" });
    }
  });

  router.post("/tools/memory-get", async (req, res) => {
    const namespace = req.body?.namespace;
    const key = req.body?.key;
    try {
      const result = await getMemory({ namespace, key });
      res.json(result);
    } catch (err) {
      if (err instanceof AgentMemoryError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "agent_memory_get failed");
      res.status(500).json({ error: "Internal error" });
    }
  });
}

router.post("/tools/token-info", async (req, res) => {
  const address =
    typeof req.body?.address === "string" ? req.body.address : null;
  if (!address) {
    res.status(400).json({ error: "Missing 'address' in JSON body" });
    return;
  }
  try {
    const result = await getTokenInfo(address);
    res.json(result);
  } catch (err) {
    if (err instanceof TokenInfoError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "token_info failed");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
