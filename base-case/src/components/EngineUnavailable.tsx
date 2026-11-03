import { AlertTriangle } from 'lucide-react';

export function EngineUnavailable({ error, compact }: { error?: string | null; compact?: boolean }) {
  return (
    <div role="status" className={`card flex flex-col items-center justify-center text-center gap-2 ${compact ? 'p-4' : 'p-8'}`}>
      <AlertTriangle className="h-5 w-5 text-warn" aria-hidden />
      <div className="font-medium">Engine not available</div>
      <p className="text-xs text-ink-3 max-w-md">The plan engine could not compute results for these inputs. Your inputs are safe; results will appear when the engine is available.</p>
      {error && <code className="num text-xxs text-ink-4 break-all max-w-md">{error}</code>}
    </div>
  );
}
