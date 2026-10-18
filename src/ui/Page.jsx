const widths = { prose: 'max-w-4xl', wide: 'max-w-[1400px]' };

/** Standard page container: centred, padded, width by `size`. */
export default function Page({ size = 'prose', className = '', ...props }) {
  return <main className={`${widths[size]} mx-auto px-6 py-4 ${className}`} {...props} />;
}
