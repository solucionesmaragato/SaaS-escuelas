import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HELP_VIDEOS_PLAYLIST_ID } from "@/lib/helpVideos";

export type HelpPlaylistVideo = {
  videoId: string;
  title: string;
};

type PlaylistResponse = {
  videos?: HelpPlaylistVideo[];
  error?: string;
};

export function useHelpPlaylistVideos() {
  return useQuery({
    queryKey: ["help-playlist-videos", HELP_VIDEOS_PLAYLIST_ID],
    queryFn: async (): Promise<HelpPlaylistVideo[]> => {
      const { data, error } = await supabase.functions.invoke<PlaylistResponse>(
        `youtube-playlist-items?playlistId=${encodeURIComponent(HELP_VIDEOS_PLAYLIST_ID)}`,
        { method: "GET" },
      );

      if (error) {
        throw new Error(error.message || "No se pudo cargar la playlist de vídeos.");
      }
      if (data?.error) {
        throw new Error(data.error);
      }

      return data?.videos ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });
}
