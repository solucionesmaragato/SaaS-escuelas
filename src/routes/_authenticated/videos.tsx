import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { HelpVideoCarousel } from "@/components/help/HelpVideoCarousel";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveTenant } from "@/context/AppContext";
import { useHelpPlaylistVideos } from "@/hooks/useHelpPlaylistVideos";
import { helpVideoEmbedUrl, HELP_VIDEOS_PLAYLIST_URL } from "@/lib/helpVideos";
import { canAccessHelpVideos } from "@/lib/helpVideosAccess";

export const Route = createFileRoute("/_authenticated/videos")({
  component: HelpVideosPage,
});

function HelpVideosPage() {
  const { rol, tenantId } = useActiveTenant();
  const { data: videos = [], isLoading, isError, error } = useHelpPlaylistVideos();
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  useEffect(() => {
    if (!videos.length) return;
    setActiveVideoId((current) => current ?? videos[0].videoId);
  }, [videos]);

  if (!canAccessHelpVideos(rol, tenantId)) {
    return <Navigate to="/dashboard" replace />;
  }

  const activeVideo = videos.find((video) => video.videoId === activeVideoId);
  const playerTitle = activeVideo?.title ?? "Videos de ayuda";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Videos"
        description="Tutoriales y guías en video para usar la plataforma."
      />

      <div className="aspect-video w-full overflow-hidden rounded-lg border bg-muted/30 shadow-sm">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : activeVideoId ? (
          <iframe
            key={activeVideoId}
            title={playerTitle}
            src={helpVideoEmbedUrl(activeVideoId)}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            No hay vídeos disponibles en la playlist.
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-40 shrink-0 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm">
          <p className="text-destructive">
            {error instanceof Error ? error.message : "Error al cargar los vídeos."}
          </p>
          <Button variant="brand-outline" size="sm" className="mt-3" asChild>
            <a href={HELP_VIDEOS_PLAYLIST_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Abrir playlist en YouTube
            </a>
          </Button>
        </div>
      ) : (
        <HelpVideoCarousel
          videos={videos}
          activeVideoId={activeVideoId}
          onSelect={setActiveVideoId}
        />
      )}

      {!isLoading && !isError && videos.length > 0 ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" asChild>
            <a href={HELP_VIDEOS_PLAYLIST_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Ver en YouTube
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
