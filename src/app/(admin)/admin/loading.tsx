export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-40 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-200" />)}
      </div>
      <div className="h-48 rounded-xl bg-slate-200" />
    </div>
  );
}
