# Video to Clips AI - Automated Video Clipping Pipeline

A Next.js application that transforms long-form videos into shareable short clips using AI-powered moment detection.

## 🎯 Overview

This application provides an end-to-end pipeline for:
- Uploading long-form videos (10-30 minutes)
- Generating timestamped transcripts using Whisper
- AI-powered highlight detection from transcripts
- Automated clip generation in both horizontal (16:9) and vertical (9:16) formats
- Metadata storage in PostgreSQL

---

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (Neon recommended)
- Redis instance (Upstash or local)
- FFmpeg installed on your system
- Groq API key (free tier available)

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd video-to-clips-ai
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# Redis (for background jobs)
REDIS_URL="redis://localhost:6379"

# Groq API (for transcription and AI analysis)
GROQ_API_KEY="your_groq_api_key_here"
```

4. **Run database migrations**
```bash
npx prisma generate
npx prisma db push
```

5. **Start the development server**
```bash
npm run dev
```

6. **Start background workers** (in separate terminals)
```bash
# Terminal 2: Transcript worker
npm run worker:transcript

# Terminal 3: Clips worker  
npm run worker:clips
```

Add these scripts to your `package.json`:
```json
{
  "scripts": {
    "dev": "next dev",
    "worker:transcript": "tsx lib/worker/transcript.worker.ts",
    "worker:clips": "tsx lib/worker/clips.worker.ts"
  }
}
```

---

## 🏗️ System Architecture

### High-Level Pipeline

```
Video Upload → Transcription → Highlight Detection → Clip Generation
     ↓              ↓                  ↓                    ↓
  Storage      AI Whisper         AI Analysis           FFmpeg
     ↓              ↓                  ↓                    ↓
  Postgres    Chunked Queue      Store Metadata      Multi-format
```

### Architecture Components

#### 1. **Video Upload & Storage**
- Videos are uploaded via Next.js API routes
- Files stored locally in `uploads/original/` directory
- Metadata (filename, filepath, duration) saved to PostgreSQL

#### 2. **Transcription Pipeline (BullMQ Worker)**
- **Chunking Strategy**: Large videos split into 120-second chunks to handle Groq's API limits
- **Worker Process**: `transcript.worker.ts` processes each video asynchronously
- **Audio Extraction**: FFmpeg extracts audio from video → MP3 format
- **Audio Splitting**: Split into 2-minute chunks for optimal API performance
- **Whisper Transcription**: Each chunk sent to Groq's Whisper API
- **Database Storage**: Transcript chunks stored with timestamps in PostgreSQL

**Why 120-second chunks?**
- Stays well within Groq's free tier limits (30 requests/min)
- Optimal balance between API calls and context length
- 2.5 second delay between chunks ensures <24 requests/min

#### 3. **AI Highlight Detection**
Multi-phase AI pipeline using Groq's Llama 3.1:

**Phase 1: Candidate Extraction**
- Transcript chunked into 4-segment pieces (8 minutes of content each)
- Each chunk analyzed for potential highlights
- Returns candidates with strength scores (0.0-1.0)

**Phase 2: Ranking & Deduplication**
- Filters clips shorter than 15 seconds
- Removes overlapping highlights (>80% overlap)
- Sorts by AI-assigned strength scores

**Phase 3: Final Selection**
- Top 10 candidates sent for final AI evaluation
- AI selects 3-5 best highlights
- Optimizes titles for clarity and engagement

#### 4. **Clip Generation (BullMQ Worker)**
- **Worker Process**: `clips.worker.ts` processes clip jobs
- **FFmpeg Processing**: Generates two versions per highlight:
  - **Horizontal (16:9)**: 1920x1080, maintains aspect ratio with padding
  - **Vertical (9:16)**: 1080x1920, center-cropped from source
- **Quality Settings**: CRF 23, fast preset, AAC audio at 128k
- **Storage**: Clips saved to `clips/{videoId}/` with sanitized filenames

#### 5. **Database Schema**

```prisma
Video (main entity)
  ↓
  ├─ Transcript (segments with timestamps)
  │    └─ TranscriptChunk (processing chunks)
  │         └─ Highlight (AI-selected moments)
  │
  └─ Clip (generated video files)
       └─ Format (horizontal/vertical)

Job (tracks async processing)
  └─ Types: TRANSCRIPT | HIGHLIGHTS | CLIPS
```

### Technology Stack

| Component | Technology | Why? |
|-----------|-----------|------|
| **Framework** | Next.js 14 | App router, API routes, TypeScript support |
| **Database** | PostgreSQL (Neon) | Relational data, JSON support for segments |
| **ORM** | Prisma | Type-safe queries, migrations |
| **Queue** | BullMQ + Redis | Reliable background job processing |
| **Video Processing** | FFmpeg | Industry-standard video manipulation |
| **AI APIs** | Groq (Whisper + Llama) | Free tier, fast processing, high quality |

### Worker Architecture

**Why BullMQ?**
- Handles long-running transcription jobs (5-10 mins for 1 hour video)
- Retry logic with exponential backoff
- Prevents API timeouts in Next.js routes
- Scalable: can run multiple workers

**Worker Flow:**
```
API creates job → BullMQ queue → Worker picks up → Process → Update DB
```

---

## 🤖 AI API Usage

### Primary AI Provider: **Groq**

#### Why Groq?

**For Transcription (Whisper):**
- ✅ **Free tier**: 30 requests/min, 14,400/day
- ✅ **Fast**: 2-5 seconds per 2-minute chunk
- ✅ **Quality**: Same Whisper model as OpenAI
- ✅ **No billing required**: Perfect for development

**For Highlight Detection (Llama 3.1-8B):**
- ✅ **Free tier**: Generous limits
- ✅ **Fast inference**: ~1-2 seconds per request
- ✅ **JSON mode**: Reliable structured outputs
- ✅ **Good reasoning**: Accurate highlight detection

#### Alternative Considered: OpenAI
- ❌ Requires paid account with billing
- ❌ More expensive per request
- ✅ Slightly better model quality (marginal for this use case)

**Decision**: Groq provides 95% of OpenAI's quality at 0% of the cost, making it ideal for this assignment.

### AI Integration Details

**Whisper Transcription:**
```typescript
// Using Groq's Whisper API
const response = await groq.audio.transcriptions.create({
  file: fs.createReadStream(audioPath),
  model: "whisper-large-v3-turbo",
  language: "en",
});
```

**Highlight Detection:**
```typescript
// Multi-phase pipeline with Llama 3.1
const completion = await groq.chat.completions.create({
  model: "llama-3.1-8b-instant",
  messages: [
    { role: "system", content: CANDIDATE_SYSTEM_PROMPT },
    { role: "user", content: formattedTranscript }
  ],
  temperature: 0.3, // Lower = more consistent
});
```

---

## 📊 Key Design Decisions & Trade-offs

### 1. **Chunked Transcription**
**Decision**: Split audio into 120-second chunks

**Why?**
- Groq free tier limits (30 req/min)
- Better error recovery (one chunk fails ≠ entire video fails)
- Parallel processing potential

**Trade-off**: Slight overhead in API calls vs. processing entire file at once

### 2. **Multi-Phase Highlight Detection**
**Decision**: Extract candidates → Rank → Final selection (3 AI calls per video)

**Why?**
- Token limits: Can't send 1-hour transcript in one prompt
- Better accuracy: Specialized prompts for each phase
- Deduplication: Prevents overlapping highlights

**Trade-off**: More API calls, but higher quality results

### 3. **BullMQ Workers**
**Decision**: Separate workers for transcription and clips

**Why?**
- Prevents Next.js API route timeouts (10 min+ for long videos)
- Retry logic for failed jobs
- Scalability: Can run multiple workers

**Trade-off**: Added complexity vs. simpler synchronous processing

### 4. **Local File Storage**
**Decision**: Store videos/clips on filesystem instead of S3

**Why?**
- Simpler setup for assignment (no AWS credentials)
- Faster development iteration
- FFmpeg works directly with local files

**Trade-off**: Not production-ready (would use S3/CDN in real app)

### 5. **No Real-time Updates**
**Decision**: Poll-based status checking instead of WebSockets

**Why?**
- Simpler implementation
- Sufficient UX for this use case
- Avoids WebSocket infrastructure

**Trade-off**: Users must refresh to see status updates

### 6. **Prisma ORM**
**Decision**: Use Prisma instead of raw SQL

**Why?**
- Type safety (catches errors at compile time)
- Easy migrations
- Cleaner query syntax

**Trade-off**: Slight performance overhead vs. raw SQL (negligible for this scale)

---

## 🎯 Assumptions Made

1. **Video Format**: Assumes standard video formats (MP4, MOV) that FFmpeg can handle
2. **Audio Present**: Videos contain audio tracks (required for transcription)
3. **English Language**: Transcription optimized for English content
4. **Single Upload**: One video processed at a time (can be scaled with worker concurrency)
5. **Local Development**: Assumes FFmpeg installed globally on system
6. **File Size**: Videos under 2GB (no explicit size validation yet)

---

## 📁 Project Structure

```
video-to-clips-ai/
├── app/
│   ├── api/
│   │   └── videos/
│   │       └── [videoId]/
│   │           ├── clips/route.ts      # Clip generation endpoint
│   │           ├── highlights/route.ts # Highlight detection
│   │           └── transcript/route.ts # Transcription trigger
│   └── page.tsx                        # Main UI (upload form)
├── lib/
│   ├── ai/
│   │   ├── highlights/
│   │   │   └── generateHighlights.ts   # Multi-phase AI pipeline
│   │   └── prompts/
│   │       └── highlight.system.ts      # AI system prompts
│   ├── chunks/
│   │   ├── createRecords.ts            # Chunk metadata creation
│   │   └── processChunks.ts            # Chunk transcription
│   ├── clips/
│   │   ├── generateClip.ts             # FFmpeg clip generation
│   │   ├── handleClipJob.ts            # Clip job orchestration
│   │   └── saveClipRow.ts              # Clip metadata storage
│   ├── media/
│   │   ├── extractAudio.ts             # Video → Audio conversion
│   │   └── splitAudio.ts               # Audio chunking
│   ├── queue/
│   │   ├── clips.queue.ts              # BullMQ clips queue
│   │   └── redis.ts                    # Redis connection
│   ├── transcription/
│   │   └── sendChunkToWhisper.ts       # Groq Whisper API call
│   ├── worker/
│   │   ├── transcript.worker.ts        # Transcription worker
│   │   └── clips.worker.ts             # Clip generation worker
│   └── prisma.ts                       # Prisma client singleton
├── prisma/
│   └── schema.prisma                   # Database schema
├── uploads/                            # Uploaded videos
├── clips/                              # Generated clips
└── README.md
```

---

## 🎬 Usage Flow

1. **Upload Video**: POST to `/api/videos/upload`
2. **Start Transcription**: POST to `/api/videos/{videoId}/transcript`
3. **Generate Highlights**: POST to `/api/videos/{videoId}/highlights`
4. **Create Clips**: POST to `/api/videos/{videoId}/clips`
5. **Download Clips**: Files available in `clips/{videoId}/`

---

## 🔮 Future Enhancements

- [ ] Auto-generated captions burned into clips
- [ ] Cloud storage (S3) for videos/clips
- [ ] Real-time progress updates (WebSockets)
- [ ] Clip preview thumbnails
- [ ] Batch video processing
- [ ] Advanced highlight customization (manual time adjustment)
- [ ] Multiple AI model support (switch between providers)

---

## 📝 License

MIT

---

## 🙏 Acknowledgments

Built using AI assistance (Claude, Cursor) for:
- FFmpeg command generation
- Error handling patterns
- Database schema design
- Worker architecture decisions

This project demonstrates effective AI-augmented development while maintaining clean architecture and thoughtful design decisions.