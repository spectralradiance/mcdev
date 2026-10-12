import { useEffect, useState } from 'react';

// Every small project's source as raw text, loaded only when its page asks for it.
const sources = import.meta.glob(['../small/*.{js,jsx}', '!../small/index.js', '!../small/*.test.js'], {
  query: '?raw',
  import: 'default',
});

const repoUrl = 'https://github.com/spectralradiance/mcdev/blob/main/src/small/';

// A private highlight.js instance with its own class prefix, so these token styles
// (in index.css) never collide with themes other pages load, like Hacker Typer's.
let highlighterRequest = null;
const loadHighlighter = () => {
  highlighterRequest ??= Promise.all([
    import('highlight.js/lib/core'),
    import('highlight.js/lib/languages/javascript'),
  ]).then(([core, javascript]) => {
    const hljs = core.default.newInstance();
    hljs.configure({ classPrefix: 'src-' });
    hljs.registerLanguage('javascript', javascript.default);
    return hljs;
  });
  return highlighterRequest;
};

export default function SourceCode({ files }) {
  const [active, setActive] = useState(files[0]);
  const [html, setHtml] = useState(null);
  const [lines, setLines] = useState(0);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    const load = sources[`../small/${active}`];
    if (!load) return undefined;
    Promise.all([load(), loadHighlighter()]).then(([code, hljs]) => {
      if (cancelled) return;
      setText(code);
      setLines(code.split('\n').length);
      setHtml(hljs.highlight(code, { language: 'javascript' }).value);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the code is still selectable.
    }
  };

  return (
    <section className="mt-12">
      <h3 className="text-lg font-semibold text-white mb-3">Source</h3>
      <div className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-800 px-3 py-2 text-xs">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Source files">
            {files.map((file) => (
              <button
                key={file}
                role="tab"
                aria-selected={file === active}
                onClick={() => setActive(file)}
                className={
                  'rounded px-2 py-1 font-mono ' +
                  (file === active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white')
                }
              >
                {file}
              </button>
            ))}
          </div>
          <span className="text-gray-500">{lines > 0 && `${lines} lines`}</span>
          <div className="ml-auto flex gap-3">
            <button onClick={copy} className="text-gray-400 hover:text-white">
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a href={repoUrl + active} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white">
              GitHub ↗
            </a>
          </div>
        </div>
        <pre className="source-code max-h-[40rem] overflow-auto p-4 text-xs leading-relaxed">
          {html === null ? (
            <code className="text-gray-500">Loading…</code>
          ) : (
            <code dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </pre>
      </div>
    </section>
  );
}
