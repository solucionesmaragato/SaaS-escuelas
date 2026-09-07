import type { HelpPlaylistVideo } from "@/hooks/useHelpPlaylistVideos";
import { helpVideoThumbnailUrl } from "@/lib/helpVideos";
import { cn } from "@/lib/utils";

type HelpVideoCarouselProps = {
  videos: HelpPlaylistVideo[];
  activeVideoId: string | null;
  onSelect: (videoId: string) => void;
};

export function HelpVideoCarousel({ videos, activeVideoId, onSelect }: HelpVideoCarouselProps) {
  if (videos.length === 0) return null;

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth"
      role="listbox"
      aria-label="Vídeos de la playlist"
    >
      {videos.map((video) => {
        const isActive = video.videoId === activeVideoId;
        return (
          <button
            key={video.videoId}
            type="button"
            role="option"
            aria-selected={isActive}
            onClick={() => onSelect(video.videoId)}
            className={cn(
              "w-40 shrink-0 snap-start overflow-hidden rounded-lg border bg-background text-left shadow-sm transition-colors hover:bg-muted/40",
              isActive ? "border-brand ring-2 ring-brand/40" : "border-border",
            )}
          >
            <img
              src={helpVideoThumbnailUrl(video.videoId)}
              alt=""
              className="aspect-video w-full object-cover"
              loading="lazy"
            />
            <p className="line-clamp-2 px-2 py-2 text-xs font-medium leading-snug">{video.title}</p>
          </button>
        );
      })}
    </div>
  );
}
