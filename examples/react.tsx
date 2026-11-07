'use client';
import { Fur } from 'furjs';
import { useRef } from 'react';

export function Example() {
  const ref = useRef(null);
  return (
    <>
      <Fur
        ref={ref}
        text="CHANDELIER"
        font="Playfair Display"
        preset="royal-sable"
        hairLength={1.1}
        wind={{ speed: 0.5, direction: 30 }}
        breathing
        style={{ height: 220 }}
      />
      <button onClick={() => (ref.current as any)?.morph?.('NOCTURNE')}>
        Morph
      </button>
    </>
  );
}
