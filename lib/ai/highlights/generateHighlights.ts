import Groq from "groq-sdk";
import { GROQ_MODEL } from "@/lib/ai/config";
import {
  CANDIDATE_SYSTEM_PROMPT,
  FINAL_SELECTION_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/highlight.system";
import {
  chunkArray,
  formatSegments,
} from "@/lib/ai/highlights/highlightHelpers";

//Types defined here

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

type Transcript = {
  segments: TranscriptSegment[];
};

type HighlightCandidate = {
  startTime: number;
  endTime: number;
  title: string;
  reason: string;
  strength: number; // 0.0 – 1.0
};

type FinalHighlight = {
  index: number;
  title: string;
  startTime: number;
  endTime: number;
  reason: string;
};

/**
 * ============================
 * Groq Client
 * ============================
 */

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

/**
 * ============================
 * Config
 * ============================
 */

const SEGMENTS_PER_CHUNK = 4;
const FINAL_MIN = 3;
const FINAL_MAX = 5;
const API_DELAY_MS = 1000;

//highlight duration limits
const MIN_HIGHLIGHT_DURATION = 15;   // seconds
const MAX_HIGHLIGHT_DURATION = 120;  // seconds

/**
 * ============================
 *  Extract candidates
 * ============================
 */

async function extractCandidates(
  segments: TranscriptSegment[],
  retries = 2
): Promise<HighlightCandidate[]> {
  const formatted = formatSegments(segments);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: CANDIDATE_SYSTEM_PROMPT },
          { role: "user", content: formatted },
        ],
        temperature: 0.3,
      });

      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from LLM (candidates)");

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("Invalid JSON from LLM (candidates)");
      }

      if (!Array.isArray(parsed.candidates)) {
        throw new Error("Invalid candidates array");
      }

      return parsed.candidates.filter((c: HighlightCandidate) => {
        return (
          typeof c.startTime === "number" &&
          typeof c.endTime === "number" &&
          c.startTime < c.endTime &&
          typeof c.title === "string" &&
          typeof c.reason === "string" &&
          typeof c.strength === "number"
        );
      });
    } catch (err: any) {
      const isRateLimit = err.status === 429;
      const isLastAttempt = attempt === retries;

      if (isRateLimit && !isLastAttempt) {
        const waitTime = 3000 * attempt;
        console.log(`Rate limited, waiting ${waitTime}ms...`);
        await new Promise((res) => setTimeout(res, waitTime));
        continue;
      }

      console.error(`Extract candidates failed (attempt ${attempt}):`, err.message);
      throw err;
    }
  }

  throw new Error("Max retries exceeded");
}

/**
 * ============================
 *  Rank and merge candidates
 * ============================
 */

function rankAndMergeCandidates(
  candidates: HighlightCandidate[]
): HighlightCandidate[] {
  //enforce min & max duration
  const filtered = candidates
    .map((c) => {
      const duration = c.endTime - c.startTime;

      if (duration > MAX_HIGHLIGHT_DURATION) {
        return {
          ...c,
          endTime: c.startTime + MAX_HIGHLIGHT_DURATION,
        };
      }

      return c;
    })
    .filter(
      (c) =>
        c.endTime - c.startTime >= MIN_HIGHLIGHT_DURATION
    );

  const deduplicated: HighlightCandidate[] = [];

  for (const candidate of filtered) {
    const isDuplicate = deduplicated.some((existing) => {
      const overlap =
        Math.min(candidate.endTime, existing.endTime) -
        Math.max(candidate.startTime, existing.startTime);
      const candidateLength = candidate.endTime - candidate.startTime;
      const existingLength = existing.endTime - existing.startTime;
      const overlapPercent =
        overlap / Math.min(candidateLength, existingLength);

      return overlapPercent > 0.8;
    });

    if (!isDuplicate) {
      deduplicated.push(candidate);
    }
  }

  return deduplicated.sort((a, b) => b.strength - a.strength);
}

/**
 * ============================
 * Final selection
 * ============================
 */

async function selectFinalHighlights(
  candidates: HighlightCandidate[],
  retries = 2
): Promise<FinalHighlight[]> {
  const formatted = candidates
    .map(
      (c) =>
        `[${c.startTime} - ${c.endTime}] ${c.title} | Strength: ${c.strength.toFixed(
          2
        )} | ${c.reason}`
    )
    .join("\n");

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: FINAL_SELECTION_SYSTEM_PROMPT },
          { role: "user", content: formatted },
        ],
        temperature: 0.2,
      });

      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from LLM (final)");

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("Invalid JSON from LLM (final)");
      }

      if (!Array.isArray(parsed.highlights)) {
        throw new Error("Invalid highlights array");
      }

      if (
        parsed.highlights.length < FINAL_MIN ||
        parsed.highlights.length > FINAL_MAX
      ) {
        throw new Error(
          `Final highlights count (${parsed.highlights.length}) out of range ${FINAL_MIN}-${FINAL_MAX}`
        );
      }

      return parsed.highlights.map((h: any, i: number) => ({
        index: i + 1,
        title: h.title,
        startTime: h.startTime,
        endTime: h.endTime,
        reason: h.reason,
      }));
    } catch (err: any) {
      const isRateLimit = err.status === 429;
      const isLastAttempt = attempt === retries;

      if (isRateLimit && !isLastAttempt) {
        const waitTime = 3000 * attempt;
        console.log(`Rate limited, waiting ${waitTime}ms...`);
        await new Promise((res) => setTimeout(res, waitTime));
        continue;
      }

      console.error(`Final selection failed (attempt ${attempt}):`, err.message);
      throw err;
    }
  }

  throw new Error("Max retries exceeded");
}

/**
 * ============================
 * Public API
 * ============================
 */

export async function generateHighlights(
  transcript: Transcript
): Promise<FinalHighlight[]> {
  if (!transcript.segments || transcript.segments.length === 0) {
    throw new Error("Transcript has no segments");
  }

  console.log(`Processing ${transcript.segments.length} segments...`);

  const chunks = chunkArray(transcript.segments, SEGMENTS_PER_CHUNK);
  console.log(`Split into ${chunks.length} chunks`);

  const allCandidates: HighlightCandidate[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);

    if (i > 0) {
      await new Promise((res) => setTimeout(res, API_DELAY_MS));
    }

    try {
      const candidates = await extractCandidates(chunks[i]);
      console.log(`Found ${candidates.length} candidates in chunk ${i + 1}`);
      allCandidates.push(...candidates);
    } catch (err: any) {
      console.error(`Failed to process chunk ${i + 1}:`, err.message);
    }
  }

  if (allCandidates.length === 0) {
    throw new Error("No highlight candidates found in any chunk");
  }

  console.log(`Total candidates found: ${allCandidates.length}`);

  const ranked = rankAndMergeCandidates(allCandidates);
  console.log(`After deduplication: ${ranked.length} candidates`);

  const topCandidates = ranked.slice(0, Math.min(10, ranked.length));
  console.log(`Sending top ${topCandidates.length} to final selection...`);

  await new Promise((res) => setTimeout(res, API_DELAY_MS));

  const finalHighlights = await selectFinalHighlights(topCandidates);
  console.log(`Selected ${finalHighlights.length} final highlights`);

  // ADD: final safety clamp
  return finalHighlights.map((h) => {
    const duration = h.endTime - h.startTime;

    if (duration > MAX_HIGHLIGHT_DURATION) {
      return {
        ...h,
        endTime: h.startTime + MAX_HIGHLIGHT_DURATION,
      };
    }

    if (duration < MIN_HIGHLIGHT_DURATION) {
      throw new Error(`Final highlight too short (${duration}s)`);
    }

    return h;
  });
}
