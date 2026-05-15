import { YoutubeTranscript } from "youtube-transcript";

export type YoutubeTranscriptSegment = {
  text: string;
  startSec: number;
  durationSec: number;
};

export type YoutubeTranscriptResult = {
  videoId: string;
  videoUrl: string;
  language: string | null;
  segments: YoutubeTranscriptSegment[];
  fullText: string;
  totalSeconds: number;
  fetchedAt: string;
};

export class YoutubeTranscriptError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "YoutubeTranscriptError";
  }
}

const ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

function extractVideoId(input: string): string | null {
  if (ID_REGEX.test(input)) return input;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return ID_REGEX.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && ID_REGEX.test(v)) return v;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "shorts" || segments[0] === "embed") {
      const id = segments[1];
      if (id && ID_REGEX.test(id)) return id;
    }
  }
  return null;
}

export async function fetchYoutubeTranscript(
  rawInput: string,
  language?: string,
): Promise<YoutubeTranscriptResult> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new YoutubeTranscriptError("Missing video URL or ID", 400);
  }
  const videoId = extractVideoId(trimmed);
  if (!videoId) {
    throw new YoutubeTranscriptError(
      "Could not extract a YouTube video ID from input",
      400,
    );
  }

  let raw;
  try {
    raw = await YoutubeTranscript.fetchTranscript(
      videoId,
      language ? { lang: language } : undefined,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "transcript fetch failed";
    if (/disabled|unavailable|not.*available|no transcript/i.test(msg)) {
      throw new YoutubeTranscriptError(
        `No transcript available for video ${videoId}`,
        404,
      );
    }
    throw new YoutubeTranscriptError(`Transcript fetch failed: ${msg}`, 502);
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new YoutubeTranscriptError(
      `No transcript segments returned for video ${videoId}`,
      404,
    );
  }

  const segments: YoutubeTranscriptSegment[] = raw.map((s) => {
    const text = String(s.text ?? "").replace(/\s+/g, " ").trim();
    const offsetRaw = Number((s as { offset?: unknown }).offset ?? 0);
    const durRaw = Number((s as { duration?: unknown }).duration ?? 0);
    // youtube-transcript v1.x reports offset/duration in milliseconds for
    // some videos and seconds for others; normalize to seconds by detecting
    // unrealistically large values.
    const startSec = offsetRaw > 86_400 ? offsetRaw / 1000 : offsetRaw;
    const durationSec = durRaw > 86_400 ? durRaw / 1000 : durRaw;
    return { text, startSec, durationSec };
  });

  const fullText = segments.map((s) => s.text).filter(Boolean).join(" ");
  const last = segments[segments.length - 1];
  const totalSeconds = last ? last.startSec + last.durationSec : 0;

  const detectedLang = language ?? null;

  return {
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    language: detectedLang,
    segments,
    fullText,
    totalSeconds,
    fetchedAt: new Date().toISOString(),
  };
}
