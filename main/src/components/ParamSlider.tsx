import { Slider } from '@/components/ui/slider';

export function ParamSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = '',
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  onReset?: () => void;
}) {
  const active = Math.abs(value) > (step ?? 0.001) / 2;
  return (
    <div className="group py-1">
      <div className="flex items-baseline justify-between gap-2">
        <button
          onClick={onReset}
          title="Double-click label to reset"
          onDoubleClick={onReset}
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          {label}
        </button>
        <span
          className={`font-mono text-[11px] tabular-nums ${
            active ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {value.toFixed(unit === '°' ? 0 : 2)}
          {unit}
        </span>
      </div>
      <Slider
        className="mt-1.5"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}
