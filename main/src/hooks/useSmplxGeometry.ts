import { useEffect, useRef, useState } from 'react';
import { SmplxModel } from '@/smplx/smplxModel';
import { buildPose } from '@/smplx/params';
import type { ParamState } from '@/smplx/params';

/**
 * Recomputes posed/shaped vertex positions whenever the model, parameters, or
 * pose-blendshape toggle change. Computation is coalesced to at most one run per
 * animation frame so dragging a slider never queues a backlog of heavy recomputes.
 */
export function useSmplxGeometry(
  model: SmplxModel | null,
  state: ParamState,
  poseBlend: boolean
): Float32Array | null {
  const [positions, setPositions] = useState<Float32Array | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!model) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const betas = Float32Array.from(state.betas);
      const expression = Float32Array.from(state.expression);
      const pose = buildPose(model, state);
      const out = model.forward(
        { betas, expression, pose },
        { poseBlendShapes: poseBlend }
      );
      setPositions(out.slice());
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [model, state, poseBlend]);

  return positions;
}
