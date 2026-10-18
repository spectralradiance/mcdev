/** Bordered panel surface. */
export default function Card({ className = '', ...props }) {
  return <div className={`rounded border border-line bg-panel p-4 ${className}`} {...props} />;
}
