import { useEffect, useRef } from 'react';
import { SmplxModel } from '@/smplx/smplxModel';
import { ThreeViewer } from './threeViewer';
import type { DisplayOptions } from './threeViewer';

export type ViewerHandle = { resetCamera: () => void };

export function Viewer({
  model,
  positions,
  display,
  onReady,
}: {
  model: SmplxModel | null;
  positions: Float32Array | null;
  display: DisplayOptions;
  onReady?: (handle: ViewerHandle) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeViewer | null>(null);
  const modelRef = useRef<SmplxModel | null>(null);
  const displayRef = useRef(display);
  displayRef.current = display;

  useEffect(() => {
    if (!containerRef.current) return;
    const v = new ThreeViewer(containerRef.current);
    viewerRef.current = v;
    onReady?.({ resetCamera: () => v.resetCamera() });
    return () => {
      v.dispose();
      viewerRef.current = null;
      modelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !model || !positions) return;
    if (modelRef.current !== model) {
      v.setModel(model, positions);
      v.setDisplayOptions(displayRef.current);
      modelRef.current = model;
    } else {
      v.updatePositions(positions, model);
    }
  }, [model, positions]);

  useEffect(() => {
    viewerRef.current?.setDisplayOptions(display);
  }, [display]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
