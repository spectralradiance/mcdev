import { Link } from 'react-router-dom';

const base =
  'inline-flex items-center justify-center gap-2 rounded border text-sm font-medium transition-colors ' +
  'disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent';

const variants = {
  solid: 'border-white bg-white text-black hover:bg-soft',
  outline: 'border-line text-soft hover:border-line-strong hover:text-white',
  ghost: 'border-transparent text-muted hover:text-white hover:bg-raised',
};

const sizes = {
  sm: 'px-2.5 py-1',
  md: 'px-4 py-2',
};

/** Button, or a router Link when `to` is given, or an anchor when `href` is given. */
export default function Button({ variant = 'outline', size = 'md', to, href, className = '', ...props }) {
  const cls = `${base} ${variants[variant]} ${sizes[size]} ${className}`;
  if (to) return <Link to={to} className={cls} {...props} />;
  if (href) return <a href={href} className={cls} {...props} />;
  return <button type="button" className={cls} {...props} />;
}
