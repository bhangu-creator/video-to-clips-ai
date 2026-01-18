// Type definition for a transcript segment
type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

// Split an array into smaller chunks of given size
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Convert transcript segments into a formatted string
export function formatSegments(segments: TranscriptSegment[]): string {
  return segments
    .map(s => `[${s.start} - ${s.end}] ${s.text}`)
    .join("\n");
}
