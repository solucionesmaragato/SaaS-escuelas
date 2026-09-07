import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEFAULT_PLAYLIST_ID = "PLZ8--FxUuYLw";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YOUTUBE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type PlaylistVideo = {
  videoId: string;
  title: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function extractYtInitialData(html: string): unknown | null {
  const marker = "var ytInitialData = ";
  const start = html.indexOf(marker);
  if (start < 0) return null;

  const jsonStart = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function parsePlaylistVideosFromInitialData(data: unknown): PlaylistVideo[] {
  const videos: PlaylistVideo[] = [];
  const seen = new Set<string>();

  const addVideo = (videoId: string | undefined, title: string | undefined) => {
    const id = videoId?.trim();
    const normalizedTitle = title?.trim();
    if (!id || !normalizedTitle || seen.has(id)) return;
    seen.add(id);
    videos.push({ videoId: id, title: normalizedTitle });
  };

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;

    const record = node as Record<string, unknown>;

    const playlistVideoRenderer = record.playlistVideoRenderer as
      | Record<string, unknown>
      | undefined;
    if (playlistVideoRenderer) {
      const title = playlistVideoRenderer.title as
        | { runs?: Array<{ text?: string }>; simpleText?: string }
        | undefined;
      const titleText = title?.runs?.map((run) => run.text ?? "").join("") || title?.simpleText;
      addVideo(playlistVideoRenderer.videoId as string | undefined, titleText);
    }

    const lockupViewModel = record.lockupViewModel as Record<string, unknown> | undefined;
    if (lockupViewModel) {
      const contentId = lockupViewModel.contentId as string | undefined;
      const metadata = lockupViewModel.metadata as Record<string, unknown> | undefined;
      const lockupMetadata = metadata?.lockupMetadataViewModel as
        | Record<string, unknown>
        | undefined;
      const titleContent = lockupMetadata?.title as { content?: string } | undefined;
      if (contentId && /^[a-zA-Z0-9_-]{11}$/.test(contentId)) {
        addVideo(contentId, titleContent?.content);
      }
    }

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    Object.values(record).forEach(walk);
  };

  walk(data);
  return videos;
}

async function fetchPlaylistVideosFromHtml(playlistId: string): Promise<PlaylistVideo[]> {
  const playlistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
  const response = await fetch(playlistUrl, {
    headers: {
      "User-Agent": YOUTUBE_USER_AGENT,
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube playlist respondió ${response.status}`);
  }

  const html = await response.text();
  const initialData = extractYtInitialData(html);
  if (!initialData) {
    throw new Error("No se pudo leer ytInitialData de la playlist.");
  }

  const videos = parsePlaylistVideosFromInitialData(initialData);
  if (videos.length === 0) {
    throw new Error("La playlist no contiene vídeos visibles.");
  }

  return videos;
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "GET") {
      return jsonResponse({ error: "Método no permitido." }, 405);
    }

    try {
      const url = new URL(req.url);
      const playlistId = url.searchParams.get("playlistId")?.trim() || DEFAULT_PLAYLIST_ID;
      const videos = await fetchPlaylistVideosFromHtml(playlistId);
      return jsonResponse({ videos });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al cargar la playlist.";
      return jsonResponse({ error: message, videos: [] }, 500);
    }
  },
};
