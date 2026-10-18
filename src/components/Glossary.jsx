import { useEffect, useMemo, useState } from 'react';
import glossary from '../data/glossary';

const slug = (t) => 'term-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const wikiSearch = (t) => 'https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(t);

const children = {};
glossary.forEach((e) => {
  if (e.parent) (children[e.parent] ||= []).push(e.term);
});
Object.values(children).forEach((list) => list.sort((a, b) => a.localeCompare(b)));

const Row = ({ label, children: kids }) => (
  <div className="flex gap-3">
    <span className="text-gray-500 text-xs w-16 shrink-0 pt-0.5">{label}</span>
    <div className="flex flex-wrap gap-2 min-w-0">{kids}</div>
  </div>
);

const TermLink = ({ term, onGo }) => (
  <button
    onClick={() => onGo(term)}
    className="text-xs px-2 py-0.5 rounded border border-gray-700 text-sky-400 hover:bg-gray-800 transition-colors"
  >
    {term}
  </button>
);

const categories = [...new Set(glossary.map((e) => e.category))].sort();

const Glossary = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [activeTag, setActiveTag] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [pending, setPending] = useState(null);

  const toggle = (term) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(term) ? next.delete(term) : next.add(term);
      return next;
    });

  // Jump to a related term: clear filters so it is visible, expand it, then scroll to it.
  const goTo = (term) => {
    setQuery('');
    setCategory('All');
    setActiveTag(null);
    setExpanded((prev) => new Set(prev).add(term));
    setPending(term);
  };

  useEffect(() => {
    if (!pending) return;
    document.getElementById(slug(pending))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setPending(null);
  }, [pending]);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return glossary
      .filter((e) => category === 'All' || e.category === category)
      .filter((e) => !activeTag || e.tags.includes(activeTag))
      .filter(
        (e) =>
          !q ||
          e.term.toLowerCase().includes(q) ||
          e.definition.toLowerCase().includes(q) ||
          e.tags.some((t) => t.includes(q))
      )
      .sort((a, b) => a.term.localeCompare(b.term));
  }, [query, category, activeTag]);

  return (
    <section>
      <h2 className="text-3xl font-bold mb-2 border-b border-gray-700 pb-2">Glossary</h2>
      <p className="text-gray-400 text-sm mt-3 mb-6">
        Terms in AI and machine learning, web development and general technology. Click a term to expand it.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms, definitions, tags…"
          className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <option value="All">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {activeTag && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <span className="text-gray-400">Filtering by tag:</span>
          <button
            onClick={() => setActiveTag(null)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors"
          >
            {activeTag} ✕
          </button>
        </div>
      )}

      <p className="text-gray-500 text-xs mb-3">
        {entries.length} term{entries.length === 1 ? '' : 's'}
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
        {entries.map((e) => {
          const open = expanded.has(e.term);
          const kids = children[e.term] || [];
          const links = e.links.length
            ? e.links
            : [{ label: 'Search Wikipedia', url: wikiSearch(e.term) }];
          return (
            <div key={e.term} id={slug(e.term)}>
              <button
                onClick={() => toggle(e.term)}
                aria-expanded={open}
                className="w-full flex items-baseline gap-3 px-4 py-2 text-left hover:bg-gray-800/50 transition-colors"
              >
                <span className="text-gray-600 text-xs shrink-0 w-3">{open ? '▾' : '▸'}</span>
                <span className="text-white font-semibold text-sm shrink-0">{e.term}</span>
                <span className={'text-gray-400 text-sm min-w-0 ' + (open ? '' : 'truncate')}>
                  {e.definition}
                </span>
              </button>

              {open && (
                <div className="px-4 pb-4 pl-10 space-y-3 text-sm">
                  <Row label="Category">
                    <button
                      onClick={() => setCategory(e.category)}
                      className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                    >
                      {e.category}
                    </button>
                  </Row>
                  {e.tags.length > 0 && (
                    <Row label="Tags">
                      {e.tags.map((t) => (
                        <button
                          key={t}
                          onClick={() => setActiveTag(t === activeTag ? null : t)}
                          className={
                            'text-xs px-2 py-0.5 rounded transition-colors ' +
                            (t === activeTag
                              ? 'bg-gray-200 text-gray-900'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700')
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </Row>
                  )}
                  {e.parent && (
                    <Row label="Parent">
                      <TermLink term={e.parent} onGo={goTo} />
                    </Row>
                  )}
                  {kids.length > 0 && (
                    <Row label="Children">
                      {kids.map((k) => (
                        <TermLink key={k} term={k} onGo={goTo} />
                      ))}
                    </Row>
                  )}
                  {e.related.length > 0 && (
                    <Row label="Related">
                      {e.related.map((r) => (
                        <TermLink key={r} term={r} onGo={goTo} />
                      ))}
                    </Row>
                  )}
                  <Row label="Links">
                    {links.map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-400 hover:text-sky-300 underline"
                      >
                        {l.label} ↗
                      </a>
                    ))}
                  </Row>
                </div>
              )}
            </div>
          );
        })}

        {entries.length === 0 && (
          <p className="text-gray-500 text-sm p-4">No terms match your search.</p>
        )}
      </div>
    </section>
  );
};

export default Glossary;
