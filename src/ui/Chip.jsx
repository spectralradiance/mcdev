/** Small pill; becomes a toggle button when `onClick` is given. `active` fills it with the accent. */
export default function Chip({ active = false, onClick, className = '', children, ...props }) {
  const cls =
    'inline-block rounded-full border px-2.5 py-0.5 text-xs transition-colors ' +
    (active
      ? 'border-accent bg-accent text-black'
      : 'border-line text-soft' + (onClick ? ' hover:border-line-strong hover:text-white' : '')) +
    ' ' + className;
  if (onClick) {
    return (
      <button type="button" aria-pressed={active} onClick={onClick} className={cls} {...props}>
        {children}
      </button>
    );
  }
  return <span className={cls} {...props}>{children}</span>;
}
