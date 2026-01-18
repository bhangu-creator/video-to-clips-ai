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

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

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
  strength: number;
};

type FinalHighlight = {
  index: number;
  title: string;
  startTime: number;
  endTime: number;
  reason: string;
};

/* -------------------------------------------------------------------------- */
/*                                GROQ CLIENT                                 */
/* -------------------------------------------------------------------------- */

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

/* -------------------------------------------------------------------------- */
/*                                CONFIGURATION                               */
/* -------------------------------------------------------------------------- */

const SEGMENTS_PER_CHUNK = 4;
const FINAL_MIN = 3;
const FINAL_MAX = 5;
const API_DELAY_MS = 1000;

const MIN_HIGHLIGHT_DURATION = 15;
const MAX_HIGHLIGHT_DURATION = 120;

/* -------------------------------------------------------------------------- */
/*                              LOGGING UTILS                                 */
/* -------------------------------------------------------------------------- */

function logStep(step: string, data?: any) {
  console.log(`\n🟦 [HIGHLIGHTS] ${step}`);
  if (data) {
    console.log(
      typeof data === "string" ? data : JSON.stringify(data, null, 2)
    );
  }
}

function logError(step: string, error: any, raw?: string) {
  console.error(`\n🟥 [HIGHLIGHTS ERROR] ${step}`);
  console.error(error?.message || error);
  if (raw) {
    console.error("\n🔴 RAW LLM OUTPUT ↓↓↓");
    console.error(raw);
    console.error("🔴 END RAW LLM OUTPUT ↑↑↑\n");
  }
}

/* -------------------------------------------------------------------------- */
/*                             JSON EXTRACTION HELPER                          */
/* -------------------------------------------------------------------------- */

function extractJsonObject<T>(text: string, rootKey: string): T {
  logStep("Attempting JSON extraction");

  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("JSON boundaries not found");
  }

  const jsonString = cleaned.slice(start, end + 1);

  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error("JSON.parse failed");
  }

  if (!(rootKey in parsed)) {
    throw new Error(`Missing root key: ${rootKey}`);
  }

  return parsed as T;
}

/* -------------------------------------------------------------------------- */
/*                         EXTRACT HIGHLIGHT CANDIDATES                        */
/* -------------------------------------------------------------------------- */

async function extractCandidates(
  segments: TranscriptSegment[],
  retries = 2
): Promise<HighlightCandidate[]> {
  logStep("Extracting candidates", {
    segmentCount: segments.length,
    timeRange: `${segments[0].start} → ${segments.at(-1)?.end}`,
  });

  const formatted = formatSegments(segments);

  for (let attempt = 1; attempt <= retries; attempt++) {
    logStep(`Candidate LLM call (attempt ${attempt})`);

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
      if (!content) throw new Error("Empty LLM response");

      const parsed = extractJsonObject<{ candidates: HighlightCandidate[] }>(
        content,
        "candidates"
      );

      logStep("Candidates parsed successfully", {
        count: parsed.candidates.length,
      });

      return parsed.candidates.filter(
        (c) =>
          typeof c.startTime === "number" &&
          typeof c.endTime === "number" &&
          c.startTime < c.endTime &&
          typeof c.title === "string" &&
          typeof c.reason === "string" &&
          typeof c.strength === "number"
      );
    } catch (err: any) {
      logError(`Candidate extraction failed (attempt ${attempt})`, err);

      if (attempt === retries) {
        throw err;
      }

      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw new Error("Candidate extraction retries exhausted");
}

/* -------------------------------------------------------------------------- */
/*                       RANK + DEDUPLICATE CANDIDATES                         */
/* -------------------------------------------------------------------------- */

function rankAndMergeCandidates(
  candidates: HighlightCandidate[]
): HighlightCandidate[] {
  logStep("Ranking & deduplicating candidates", {
    inputCount: candidates.length,
  });

  const filtered = candidates
    .map((c) => {
      const duration = c.endTime - c.startTime;
      if (duration > MAX_HIGHLIGHT_DURATION) {
        return { ...c, endTime: c.startTime + MAX_HIGHLIGHT_DURATION };
      }
      return c;
    })
    .filter((c) => c.endTime - c.startTime >= MIN_HIGHLIGHT_DURATION);

  const deduplicated: HighlightCandidate[] = [];

  for (const candidate of filtered) {
    const isDuplicate = deduplicated.some((existing) => {
      const overlap =
        Math.min(candidate.endTime, existing.endTime) -
        Math.max(candidate.startTime, existing.startTime);

      const overlapRatio =
        overlap /
        Math.min(
          candidate.endTime - candidate.startTime,
          existing.endTime - existing.startTime
        );

      return overlapRatio > 0.8;
    });

    if (!isDuplicate) {
      deduplicated.push(candidate);
    }
  }

  logStep("Deduplication complete", {
    outputCount: deduplicated.length,
  });

  return deduplicated.sort((a, b) => b.strength - a.strength);
}

/* -------------------------------------------------------------------------- */
/*                         FINAL HIGHLIGHT SELECTION                           */
/* -------------------------------------------------------------------------- */

async function selectFinalHighlights(
  candidates: HighlightCandidate[],
  retries = 2
): Promise<FinalHighlight[]> {
  logStep("Final selection started", {
    candidateCount: candidates.length,
  });

  const formatted = candidates
    .map(
      (c) =>
        `[${c.startTime}-${c.endTime}] ${c.title} (${c.strength}) ${c.reason}`
    )
    .join("\n");

  for (let attempt = 1; attempt <= retries; attempt++) {
    logStep(`Final LLM call (attempt ${attempt})`);

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
      if (!content) throw new Error("Empty LLM response");

      const parsed = extractJsonObject<{ highlights: any[] }>(
        content,
        "highlights"
      );

      logStep("Final highlights parsed", {
        count: parsed.highlights.length,
      });

      return parsed.highlights.map((h, i) => ({
        index: i + 1,
        title: h.title,
        startTime: h.startTime,
        endTime: h.endTime,
        reason: h.reason,
      }));
    } catch (err: any) {
      logError(
        `Final selection failed (attempt ${attempt})`,
        err,
        attempt === retries ? undefined : undefined
      );

      if (attempt === retries) {
        throw err;
      }

      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw new Error("Final selection retries exhausted");
}

/* -------------------------------------------------------------------------- */
/*                              MAIN ENTRY POINT                              */
/* -------------------------------------------------------------------------- */

export async function generateHighlights(
  transcript: Transcript
): Promise<FinalHighlight[]> {
  logStep("Generate highlights started", {
    segments: transcript.segments.length,
  });

  if (!transcript.segments?.length) {
    throw new Error("Transcript has no segments");
  }

  const chunks = chunkArray(transcript.segments, SEGMENTS_PER_CHUNK);
  logStep("Transcript chunked", { chunkCount: chunks.length });

  const allCandidates: HighlightCandidate[] = [];

  for (let i = 0; i < chunks.length; i++) {
    logStep(`Processing chunk ${i + 1}/${chunks.length}`);

    if (i > 0) {
      await new Promise((r) => setTimeout(r, API_DELAY_MS));
    }

    try {
      const candidates = await extractCandidates(chunks[i]);
      allCandidates.push(...candidates);
    } catch (err: any) {
      logError(`Chunk ${i + 1} failed`, err);
    }
  }

  if (!allCandidates.length) {
    throw new Error("No highlight candidates found");
  }

  logStep("Total candidates collected", {
    count: allCandidates.length,
  });

  const ranked = rankAndMergeCandidates(allCandidates);
  const topCandidates = ranked.slice(0, 10);

  await new Promise((r) => setTimeout(r, API_DELAY_MS));

  const finalHighlights = await selectFinalHighlights(topCandidates);

  logStep("Final highlights complete", {
    count: finalHighlights.length,
  });

  return finalHighlights;
}
