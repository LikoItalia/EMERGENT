// Chunk-based recorder for the browser using MediaRecorder.
// We stop+restart every CHUNK_MS so each chunk is a self-contained, decodable file.

export type RecorderOptions = {
  chunkMs?: number;
  onChunk: (blob: Blob, mimeType: string) => void;
  onError?: (err: Error) => void;
};

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const mt of PREFERRED_MIME_TYPES) {
    try { if (MediaRecorder.isTypeSupported(mt)) return mt; } catch {}
  }
  return "";
}

export class ChunkRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunkMs: number;
  private onChunk: (blob: Blob, mt: string) => void;
  private onError?: (e: Error) => void;
  private timer: number | null = null;
  private stopping = false;
  private mimeType = "";

  constructor(opts: RecorderOptions) {
    this.chunkMs = opts.chunkMs ?? 4000;
    this.onChunk = opts.onChunk;
    this.onError = opts.onError;
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Il browser non supporta la registrazione audio");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mimeType = pickMimeType();
    this.stopping = false;
    this.cycle();
  }

  private cycle = () => {
    if (this.stopping || !this.stream) return;
    let pieces: Blob[] = [];
    const rec = new MediaRecorder(
      this.stream,
      this.mimeType ? { mimeType: this.mimeType } : undefined
    );
    this.recorder = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) pieces.push(e.data);
    };
    rec.onstop = () => {
      if (pieces.length === 0) return;
      const blob = new Blob(pieces, { type: this.mimeType || "audio/webm" });
      pieces = [];
      if (blob.size > 500) {
        try { this.onChunk(blob, this.mimeType || "audio/webm"); }
        catch (e) { this.onError?.(e as Error); }
      }
      if (!this.stopping) this.cycle();
    };
    rec.onerror = (e: any) => {
      this.onError?.(new Error(e?.error?.message || "MediaRecorder error"));
    };
    rec.start();
    this.timer = window.setTimeout(() => {
      try { rec.state !== "inactive" && rec.stop(); } catch {}
    }, this.chunkMs);
  };

  stop(): void {
    this.stopping = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}
