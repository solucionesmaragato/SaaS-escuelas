export const HELP_VIDEOS_PLAYLIST_ID = "PLZ8--FxUuYLw";

export const HELP_VIDEOS_PLAYLIST_URL = `https://youtube.com/playlist?list=${HELP_VIDEOS_PLAYLIST_ID}`;

export const HELP_VIDEOS_PLAYLIST_EMBED_URL = `https://www.youtube.com/embed/videoseries?list=${HELP_VIDEOS_PLAYLIST_ID}`;

export function helpVideoEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?list=${HELP_VIDEOS_PLAYLIST_ID}`;
}

export function helpVideoThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}
