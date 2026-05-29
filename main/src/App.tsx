import { useCallback, useRef, useState } from 'react';
import { SmplxModel } from '@/smplx/smplxModel';
import { makeInitialState } from '@/smplx/params';
import type { ParamState } from '@/smplx/params';
import type { DisplayOptions } from '@/components/threeViewer';
import { useSmplxGeometry } from '@/hooks/useSmplxGeometry';
import { Viewer } from '@/components/Viewer';
import type { ViewerHandle } from '@/components/Viewer';
import { ControlPanel } from '@/components/ControlPanel';
import { ModelLoader } from '@/components/ModelLoader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload } from 'lucide-react';

function App() {
  const [model, setModel] = useState<SmplxModel | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [state, setState] = useState<ParamState>(() => makeInitialState(16, 10));
  const [display, setDisplay] = useState<DisplayOptions>({
    wireframe: false,
    showSkeleton: false,
    meshOpacity: 1,
  });
  const [poseBlend, setPoseBlend] = useState(true);
  const viewerHandle = useRef<ViewerHandle | null>(null);

  const positions = useSmplxGeometry(model, state, poseBlend);

  const handleLoaded = useCallback((m: SmplxModel, name: string) => {
    setModel(m);
    setFileName(name);
    setState(makeInitialState(m.numBetas, m.numExpr));
  }, []);

  const handleUnload = useCallback(() => {
    setModel(null);
    setFileName('');
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-grid text-foreground">
      <header className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-lg font-semibold tracking-tight text-foreground">
            SMPL-X <span className="text-primary">Viewer</span>
          </h1>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            parametric body explorer
          </span>
        </div>
        {model && (
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="max-w-[220px] truncate border-primary/40 font-mono text-[11px] text-primary/90"
              title={fileName}
            >
              {fileName}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUnload}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Upload className="h-3.5 w-3.5" />
              Load new model
            </Button>
          </div>
        )}
      </header>

      {!model ? (
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="fade-up w-full max-w-xl">
            <ModelLoader onLoaded={handleLoaded} />
          </div>
        </main>
      ) : (
        <main className="flex min-h-0 flex-1">
          <section className="relative min-w-0 flex-1">
            <Viewer
              model={model}
              positions={positions}
              display={display}
              onReady={(h) => (viewerHandle.current = h)}
            />
            <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              {model.numVerts.toLocaleString()} verts · {model.numJoints} joints · drag to orbit
            </div>
          </section>
          <aside className="panel scroll-slim w-[360px] shrink-0 overflow-y-auto border-l border-border/60">
            <ControlPanel
              model={model}
              state={state}
              setState={setState}
              display={display}
              setDisplay={setDisplay}
              poseBlend={poseBlend}
              setPoseBlend={setPoseBlend}
              onResetCamera={() => viewerHandle.current?.resetCamera()}
            />
          </aside>
        </main>
      )}
    </div>
  );
}

export default App;
