"use client";
import { useEffect, useRef } from 'react';
export function useRefocus(refresh: () => void) {
  const callback = useRef(refresh); callback.current = refresh;
  useEffect(() => {
    let last = Date.now();
    const focus = () => { if (Date.now() - last >= 300_000) { last = Date.now(); callback.current(); } };
    window.addEventListener('focus', focus); return () => window.removeEventListener('focus', focus);
  }, []);
}
