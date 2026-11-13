"use client";
// Ref sempre com o valor mais recente (callbacks lidos dentro de efeitos/animações).
import { useEffect, useRef } from "react";

export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
