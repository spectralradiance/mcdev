import { useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import c from 'highlight.js/lib/languages/c';
import 'highlight.js/styles/monokai.css';

hljs.registerLanguage('c', c);

// The C compiler's second pass from Research Unix.
const url = 'https://raw.githubusercontent.com/qrush/unix/master/src/c/c02.c';
const charsPerKey = 6;

// Every keypress reveals the next few characters of real source code.
export default function HackerTyper() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [shown, setShown] = useState(0);
  const codeRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then(setCode)
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const element = codeRef.current;
    element.textContent = code.substring(0, shown);
    delete element.dataset.highlighted;
    hljs.highlightElement(element);
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [code, shown]);

  const handleKeyDown = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.key === 'Tab') return;
    event.preventDefault();
    setShown((n) => (n + charsPerKey >= code.length ? 0 : n + charsPerKey));
  };

  return (
    <div>
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="h-96 overflow-y-auto rounded border border-gray-700 bg-[#272822] focus:border-gray-400 focus:outline-none"
      >
        <pre className="m-0 text-sm">
          <code ref={codeRef} className="language-c" />
        </pre>
        {shown === 0 && (
          <p className="px-4 py-3 text-sm text-gray-400">
            {error ? `Couldn't load the source: ${error}` : 'Click here and start typing.'}
          </p>
        )}
      </div>
    </div>
  );
}
