const styles = {
  1: 'text-3xl font-bold mb-6 border-b border-line pb-2',
  2: 'mt-6 text-2xl font-semibold',
  3: 'text-lg font-semibold text-white mb-2',
};

/** Page/section heading: level picks both the tag and the shared style. */
export default function Heading({ level = 1, className = '', ...props }) {
  const Tag = `h${level}`;
  return <Tag className={`${styles[level]} ${className}`} {...props} />;
}
