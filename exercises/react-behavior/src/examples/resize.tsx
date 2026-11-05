// checked-example: react-resize
import { useEffect, useLayoutEffect, useRef } from 'react';

function useResize(onResize: () => void) {
  const latest = useRef(onResize);
  useLayoutEffect(() => {
    latest.current = onResize;
  }, [onResize]);
  useEffect(() => {
    const listener = () => latest.current();
    window.addEventListener('resize', listener);
    return () => window.removeEventListener('resize', listener);
  }, []);
}

export { useResize };
