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

// Type definitions for transcript and highlights

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

/**
 * Groq client setup
 */

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

/**
 * Configuration values
 */

const SEGMENTS_PER_CHUNK = 4;
const FINAL_MIN = 3;
const FINAL_MAX = 5;
const API_DELAY_MS = 1000;

// Highlight duration limits
const MIN_HIGHLIGHT_DURATION = 15;
const MAX_HIGHLIGHT_DURATION = 120;

/**
 * Extract highlight candidates from transcript segments
 */

async function extractCandidates(
  segments: TranscriptSegment[],
  retries = 2
): Promise<HighlightCandidate[]> {

  // Convert segments into LLM-friendly format
  const formatted = formatSegments(segments);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Call LLM to extract highlight candidates
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: CANDIDATE_SYSTEM_PROMPT },
          { role: "user", content: formatted },
        ],
        temperature: 0.3,
      });

      // Read LLM response
      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from LLM (candidates)");

      // Parse JSON response
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("Invalid JSON from LLM (candidates)");
      }

      // Validate candidates array
      if (!Array.isArray(parsed.candidates)) {
        throw new Error("Invalid candidates array");
      }

      // Filter valid candidates
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
      // Handle rate limits with retry
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
 * Rank candidates and remove duplicates
 */

function rankAndMergeCandidates(
  candidates: HighlightCandidate[]
): HighlightCandidate[] {

  // Enforce minimum and maximum duration
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

  // Remove overlapping highlights
  for (const candidate of filtered) {
    const isDuplicate = deduplicated.some((existing) => {
      const overlap =
        Math.min(candidate.endTime, existing.endTime) -
        Math.max(candidate.startTime, existing.startTime);

      const overlapPercent =
        overlap /
        Math.min(
          candidate.endTime - candidate.startTime,
          existing.endTime - existing.startTime
        );

      return overlapPercent > 0.8;
    });

    if (!isDuplicate) {
      deduplicated.push(candidate);
    }
  }

  // Sort by strength score
  return deduplicated.sort((a, b) => b.strength - a.strength);
}

/**
 * Select final highlights using LLM
 */

async function selectFinalHighlights(
  candidates: HighlightCandidate[],
  retries = 2
): Promise<FinalHighlight[]> {

  // Format candidates for final selection
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
      // Call LLM for final highlight selection
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

      // Parse JSON response
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("Invalid JSON from LLM (final)");
      }

      // Validate highlights array
      if (!Array.isArray(parsed.highlights)) {
        throw new Error("Invalid highlights array");
      }

      // Ensure highlight count is within limits
      if (
        parsed.highlights.length < FINAL_MIN ||
        parsed.highlights.length > FINAL_MAX
      ) {
        throw new Error(
          `Final highlights count (${parsed.highlights.length}) out of range`
        );
      }

      // Add index to final highlights
      return parsed.highlights.map((h: any, i: number) => ({
        index: i + 1,
        title: h.title,
        startTime: h.startTime,
        endTime: h.endTime,
        reason: h.reason,
      }));
    } catch (err: any) {
      // Handle rate limits with retry
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
 * Main function to generate highlights from transcript
 */

export async function generateHighlights(
  transcript: Transcript
): Promise<FinalHighlight[]> {

  // Validate transcript input
  if (!transcript.segments || transcript.segments.length === 0) {
    throw new Error("Transcript has no segments");
  }

  console.log(`Processing ${transcript.segments.length} segments...`);

  // Split transcript into chunks
  const chunks = chunkArray(transcript.segments, SEGMENTS_PER_CHUNK);
  console.log(`Split into ${chunks.length} chunks`);

  const allCandidates: HighlightCandidate[] = [];

  // Process each chunk separately
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);

    // Delay between API calls
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

  // Ensure at least one candidate exists
  if (allCandidates.length === 0) {
    throw new Error("No highlight candidates found");
  }

  console.log(`Total candidates found: ${allCandidates.length}`);

  // Rank and deduplicate candidates
  const ranked = rankAndMergeCandidates(allCandidates);
  console.log(`After deduplication: ${ranked.length} candidates`);

  // Select top candidates
  const topCandidates = ranked.slice(0, Math.min(10, ranked.length));
  console.log(`Sending top ${topCandidates.length} to final selection...`);

  await new Promise((res) => setTimeout(res, API_DELAY_MS));

  // Get final highlights
  const finalHighlights = await selectFinalHighlights(topCandidates);
  console.log(`Selected ${finalHighlights.length} final highlights`);

  // Final duration safety check
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
