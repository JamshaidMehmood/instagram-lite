import { useEffect, useRef } from 'react';

interface Options {
  hasMore: boolean;
  isFetching: boolean;
  onLoadMore: () => void;
}

/**
 * Loads the next page when a sentinel element scrolls into view.
 *
 * IntersectionObserver rather than a scroll listener: the browser computes
 * visibility off the main thread, so this does not fire dozens of layout reads
 * per second while the user is flicking through a feed.
 */
export function useInfiniteScroll({ hasMore, isFetching, onLoadMore }: Options) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Held in a ref so changing the callback identity between renders does not
  // tear down and rebuild the observer.
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isFetching) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMoreRef.current();
      },
      // Start fetching before the sentinel is actually visible, so the next
      // page is usually there by the time the user reaches the bottom.
      { rootMargin: '600px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isFetching]);

  return sentinelRef;
}
