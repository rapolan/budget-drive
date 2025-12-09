import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface SwipeConfig {
  minSwipeDistance?: number; // Minimum distance in pixels to trigger swipe
  maxSwipeTime?: number; // Maximum time in ms for swipe
  enabled?: boolean; // Enable/disable swipe
}

export const useSwipeNavigation = (config: SwipeConfig = {}) => {
  const {
    minSwipeDistance = 50,
    maxSwipeTime = 300,
    enabled = true,
  } = config;

  const navigate = useNavigate();
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndTime = Date.now();

      const deltaX = touchEndX - touchStartX.current;
      const deltaY = touchEndY - touchStartY.current;
      const deltaTime = touchEndTime - touchStartTime.current;

      // Check if swipe is horizontal and fast enough
      const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
      const isRightSwipe = deltaX > minSwipeDistance;
      const isFastEnough = deltaTime < maxSwipeTime;

      // Right swipe = go back (like iOS and Android)
      if (isHorizontalSwipe && isRightSwipe && isFastEnough) {
        // Prevent swipe on input elements
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }

        navigate(-1);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, minSwipeDistance, maxSwipeTime, navigate]);
};
