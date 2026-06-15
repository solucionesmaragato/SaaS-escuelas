import { useCallback, useEffect, useState } from "react";

const DEFAULT_CHUNK = 30;
const SCROLL_THRESHOLD_PX = 120;

/** Progressive list reveal on panel scroll (not page pagination). */
export function useScrollChunk<T>(items: T[], chunkSize = DEFAULT_CHUNK) {
  const [visible, setVisible] = useState(chunkSize);

  useEffect(() => {
    setVisible(chunkSize);
  }, [items, chunkSize]);

  const slice = items.slice(0, visible);
  const hasMore = visible < items.length;

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (
        el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD_PX &&
        hasMore
      ) {
        setVisible((v) => Math.min(v + chunkSize, items.length));
      }
    },
    [hasMore, items.length, chunkSize],
  );

  return { slice, onScroll, hasMore };
}
