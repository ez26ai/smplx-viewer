import { useCallback, useRef, useState } from 'react';
import { Loader2, UploadCloud, ShieldCheck, AlertTriangle } from 'lucide-react';
import { SmplxModel } from '@/smplx/smplxModel';

export function ModelLoader({
  onLoaded,
}: {
  onLoaded: (model: SmplxModel, fileName: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.name.toLowerCase().endsWith('.npz')) {
        setError('Please choose a .npz file (e.g. SMPLX_NEUTRAL.npz).');
        return;
      }
      setBusy(true);
      try {
        const buf = await file.arrayBuffer();
        const model = await SmplxModel.loadFromNpz(buf, { numBetas: 16, numExpr: 10 });
        onLoaded(model, file.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse the model file.');
      } finally {
        setBusy(false);
      }
    },
    [onLoaded]
  );

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="fade-up w-full max-w-xl">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={`panel accent-glow relative cursor-pointer rounded-xl px-8 py-12 text-center transition-all ${
            dragging ? 'scale-[1.01] border-primary' : ''
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".npz"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            {busy ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : (
              <UploadCloud className="h-7 w-7" />
            )}
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">
            {busy ? 'Parsing model…' : 'Load an SMPL-X model'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Drop a <span className="font-mono text-foreground">SMPLX_*.npz</span> file here, or
            click to browse. The viewer reconstructs and skins the mesh entirely in your browser.
          </p>

          {error && (
            <div className="mx-auto mt-5 flex max-w-md items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2 px-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-primary/80" />
            Files are read locally and never uploaded anywhere.
          </p>
          <p>
            The SMPL-X model is licensed for research. Register and download the
            <span className="font-mono text-foreground/90"> SMPL-X</span> models from
            <a className="font-mono text-foreground/90" href="https://smpl-x.is.tue.mpg.de/"> HERE</a>, then use
            the file named like <span className="font-mono text-foreground/90">SMPLX_NEUTRAL.npz</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
