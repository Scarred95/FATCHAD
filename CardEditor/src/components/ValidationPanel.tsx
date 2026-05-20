import type { ValidationIssue } from '../utils/validate';

export function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  if (!issues.length) {
    return (
      <div className="panel p-3 text-sm text-emerald-400">
        ✓ No issues
      </div>
    );
  }
  return (
    <div className="panel p-3 space-y-2">
      {errors.length > 0 && (
        <div>
          <div className="field-label text-red-400 mb-1">{errors.length} error(s)</div>
          <ul className="space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="text-xs text-red-200">
                <span className="text-red-400">●</span> {e.message}
                {e.path && <span className="text-zinc-500 ml-1 font-mono">@{e.path}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <div className="field-label text-amber-400 mb-1">{warnings.length} warning(s)</div>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-200">
                <span className="text-amber-400">●</span> {w.message}
                {w.path && <span className="text-zinc-500 ml-1 font-mono">@{w.path}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
