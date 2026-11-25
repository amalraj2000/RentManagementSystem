/** Re-mounts on every navigation, so each page change gets a short fade-in (see .page-fade in globals.css). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
