import { useMemo, useState } from 'react';
import glossary from '../data/glossary';

const categories = [...new Set(glossary.map((e) => e.category))].sort();

const Glossary = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [activeTag, setActiveTag] = useState(null);

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
        Common terms in web development and general technology.
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

      <div className="space-y-3">
        {entries.map((e) => (
          <div
            key={e.term}
            className="bg-gray-900 border border-gray-800 rounded-lg p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-white font-semibold">{e.term}</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 shrink-0">
                {e.category}
              </span>
            </div>
            <p className="text-gray-400 text-sm mt-1">{e.definition}</p>
            <div className="flex flex-wrap gap-2 mt-3">
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
            </div>
          </div>
        ))}

        {entries.length === 0 && (
          <p className="text-gray-500 text-sm">No terms match your search.</p>
        )}
      </div>
    </section>
  );
};

export default Glossary;
