import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Dice5, RotateCcw } from 'lucide-react';
import { ParamSlider } from './ParamSlider';
import type { DisplayOptions } from './threeViewer';
import { PRESETS } from '@/smplx/params';
import type { ParamState } from '@/smplx/params';
import { POSE_JOINT_GROUPS, JOINT_NAMES } from '@/smplx/skeleton';
import { SmplxModel } from '@/smplx/smplxModel';

type Axis = 0 | 1 | 2;
const AXES: { axis: Axis; label: string }[] = [
  { axis: 0, label: 'Rot X' },
  { axis: 1, label: 'Rot Y' },
  { axis: 2, label: 'Rot Z' },
];

export function ControlPanel({
  model,
  state,
  setState,
  display,
  setDisplay,
  poseBlend,
  setPoseBlend,
  onResetCamera,
}: {
  model: SmplxModel;
  state: ParamState;
  setState: (updater: (s: ParamState) => ParamState) => void;
  display: DisplayOptions;
  setDisplay: (d: DisplayOptions) => void;
  poseBlend: boolean;
  setPoseBlend: (v: boolean) => void;
  onResetCamera: () => void;
}) {
  const setBeta = (i: number, v: number) =>
    setState((s) => {
      const betas = s.betas.slice();
      betas[i] = v;
      return { ...s, betas };
    });
  const setExpr = (i: number, v: number) =>
    setState((s) => {
      const expression = s.expression.slice();
      expression[i] = v;
      return { ...s, expression };
    });
  const setJointAxis = (j: number, axis: Axis, v: number) =>
    setState((s) => {
      const joints = { ...s.joints };
      const cur = (joints[j] ?? [0, 0, 0]).slice() as [number, number, number];
      cur[axis] = v;
      joints[j] = cur;
      return { ...s, joints };
    });
  const setGlobal = (axis: Axis, v: number) =>
    setState((s) => {
      const g = s.global.slice() as [number, number, number];
      g[axis] = v;
      return { ...s, global: g };
    });

  return (
    <Tabs defaultValue="shape" className="flex h-full flex-col">
      <TabsList className="mx-3 mt-3 grid grid-cols-4 bg-secondary/60">
        <TabsTrigger value="shape" className="font-mono text-xs uppercase tracking-wide">
          Shape
        </TabsTrigger>
        <TabsTrigger value="pose" className="font-mono text-xs uppercase tracking-wide">
          Pose
        </TabsTrigger>
        <TabsTrigger value="face" className="font-mono text-xs uppercase tracking-wide">
          Face
        </TabsTrigger>
        <TabsTrigger value="view" className="font-mono text-xs uppercase tracking-wide">
          View
        </TabsTrigger>
      </TabsList>

      <div className="scroll-slim mt-2 flex-1 overflow-y-auto px-3 pb-6">
        {/* ---------------- SHAPE ---------------- */}
        <TabsContent value="shape" className="mt-2">
          <SectionHint>
            Shape coefficients <span className="font-mono">β</span> drive the identity blend
            shapes — body proportions like height, weight, and build.
          </SectionHint>
          <div className="mb-3 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 flex-1 gap-1.5 text-xs"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  betas: s.betas.map(() => +(Math.random() * 4 - 2).toFixed(2)),
                }))
              }
            >
              <Dice5 className="h-3.5 w-3.5" /> Randomize
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 flex-1 gap-1.5 text-xs"
              onClick={() => setState((s) => ({ ...s, betas: s.betas.map(() => 0) }))}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>
          {state.betas.map((v, i) => (
            <ParamSlider
              key={i}
              label={`β${i}`}
              value={v}
              min={-5}
              max={5}
              step={0.05}
              onChange={(val) => setBeta(i, val)}
              onReset={() => setBeta(i, 0)}
            />
          ))}
        </TabsContent>

        {/* ---------------- POSE ---------------- */}
        <TabsContent value="pose" className="mt-2">
          <SectionHint>
            Each joint is an axis-angle rotation (degrees). Pelvis drives the whole body.
          </SectionHint>
          <div className="mb-3">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Presets
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.name}
                  size="sm"
                  variant="outline"
                  className="h-7 border-border/70 px-2.5 text-xs"
                  onClick={() => setState((s) => p.apply(s))}
                >
                  {p.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="mb-2 rounded-md border border-border/60 bg-secondary/30 p-2.5">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-primary/90">
              Global orientation
            </p>
            {AXES.map(({ axis, label }) => (
              <ParamSlider
                key={axis}
                label={label}
                value={state.global[axis]}
                min={-180}
                max={180}
                step={1}
                unit="°"
                onChange={(v) => setGlobal(axis, v)}
                onReset={() => setGlobal(axis, 0)}
              />
            ))}
          </div>

          <Accordion type="multiple" className="w-full">
            {POSE_JOINT_GROUPS.map((grp) => (
              <AccordionItem key={grp.group} value={grp.group} className="border-border/50">
                <AccordionTrigger className="py-2.5 font-display text-sm hover:no-underline">
                  {grp.group}
                </AccordionTrigger>
                <AccordionContent>
                  {grp.joints.map((jc) => (
                    <div key={jc.index} className="mb-2.5">
                      <p className="mb-0.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
                        <span>{jc.label}</span>
                        <span className="text-muted-foreground/50">
                          {JOINT_NAMES[jc.index]}
                        </span>
                      </p>
                      {AXES.map(({ axis, label }) => (
                        <ParamSlider
                          key={axis}
                          label={label}
                          value={state.joints[jc.index]?.[axis] ?? 0}
                          min={-180}
                          max={180}
                          step={1}
                          unit="°"
                          onChange={(v) => setJointAxis(jc.index, axis, v)}
                          onReset={() => setJointAxis(jc.index, axis, 0)}
                        />
                      ))}
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
            <AccordionItem value="hands" className="border-border/50">
              <AccordionTrigger className="py-2.5 font-display text-sm hover:no-underline">
                Hands
              </AccordionTrigger>
              <AccordionContent>
                <ParamSlider
                  label="Left finger curl"
                  value={state.leftHandCurl}
                  min={-30}
                  max={90}
                  step={1}
                  unit="°"
                  onChange={(v) => setState((s) => ({ ...s, leftHandCurl: v }))}
                  onReset={() => setState((s) => ({ ...s, leftHandCurl: 0 }))}
                />
                <ParamSlider
                  label="Right finger curl"
                  value={state.rightHandCurl}
                  min={-30}
                  max={90}
                  step={1}
                  unit="°"
                  onChange={(v) => setState((s) => ({ ...s, rightHandCurl: v }))}
                  onReset={() => setState((s) => ({ ...s, rightHandCurl: 0 }))}
                />
                <ToggleRow
                  label="Relaxed hands (mean pose)"
                  checked={state.relaxedHands}
                  onChange={(v) => setState((s) => ({ ...s, relaxedHands: v }))}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Separator className="my-3" />
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-full gap-1.5 text-xs"
            onClick={() =>
              setState((s) => ({
                ...s,
                global: [0, 0, 0],
                joints: {},
                leftHandCurl: 0,
                rightHandCurl: 0,
              }))
            }
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset all pose
          </Button>
        </TabsContent>

        {/* ---------------- FACE ---------------- */}
        <TabsContent value="face" className="mt-2">
          {model.numExpr > 0 ? (
            <>
              <SectionHint>
                Expression coefficients <span className="font-mono">ψ</span> drive the facial
                expression blend shapes. The jaw is in the Pose tab.
              </SectionHint>
              <div className="mb-3 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 flex-1 gap-1.5 text-xs"
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      expression: s.expression.map(() => +(Math.random() * 3 - 1.5).toFixed(2)),
                    }))
                  }
                >
                  <Dice5 className="h-3.5 w-3.5" /> Randomize
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 flex-1 gap-1.5 text-xs"
                  onClick={() => setState((s) => ({ ...s, expression: s.expression.map(() => 0) }))}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </Button>
              </div>
              {state.expression.map((v, i) => (
                <ParamSlider
                  key={i}
                  label={`ψ${i}`}
                  value={v}
                  min={-3}
                  max={3}
                  step={0.05}
                  onChange={(val) => setExpr(i, val)}
                  onReset={() => setExpr(i, 0)}
                />
              ))}
            </>
          ) : (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              This model has no expression space.
            </p>
          )}
        </TabsContent>

        {/* ---------------- VIEW ---------------- */}
        <TabsContent value="view" className="mt-2 space-y-1">
          <SectionHint>Rendering and diagnostics.</SectionHint>
          <ToggleRow
            label="Wireframe"
            checked={display.wireframe}
            onChange={(v) => setDisplay({ ...display, wireframe: v })}
          />
          <ToggleRow
            label="Show skeleton"
            checked={display.showSkeleton}
            onChange={(v) => setDisplay({ ...display, showSkeleton: v })}
          />
          <ToggleRow
            label="Pose blend shapes"
            hint="Corrective deformations near joints. Disable for faster dragging."
            checked={poseBlend}
            onChange={setPoseBlend}
          />
          <div className="pt-1">
            <ParamSlider
              label="Mesh opacity"
              value={display.meshOpacity}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(v) => setDisplay({ ...display, meshOpacity: v })}
              onReset={() => setDisplay({ ...display, meshOpacity: 1 })}
            />
          </div>
          <Separator className="my-3" />
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-full gap-1.5 text-xs"
            onClick={onResetCamera}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Recenter camera
          </Button>
        </TabsContent>
      </div>
    </Tabs>
  );
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{children}</p>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
