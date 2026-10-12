import { useCallback, useEffect, useRef, useState } from 'react';

const charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'abcdefghijklmnopqrstuvwxzy';
const averageIterations = 50;
const maxIterations = 100;

const randomChar = () => charSet.charAt(Math.floor(Math.random() * charSet.length));

// Scrambles the text, then resolves each character independently, with a
// 1-in-50 chance per frame, until all are correct or 100 frames have passed.
export default function DecodingText() {
  const [input, setInput] = useState('reality is a persistent illusion');
  const [output, setOutput] = useState('');
  const frame = useRef(null);

  const decode = useCallback((target) => {
    cancelAnimationFrame(frame.current);
    let iterations = 0;
    const chars = Array.from(target, randomChar);

    const step = () => {
      iterations++;
      for (let i = 0; i < chars.length; ++i) {
        if (chars[i] === target.charAt(i)) continue;
        chars[i] = Math.random() < 1 / averageIterations || iterations >= maxIterations
          ? target.charAt(i)
          : randomChar();
      }
      const text = chars.join('');
      setOutput(text);
      if (text !== target) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    decode(input);
    return () => cancelAnimationFrame(frame.current);
    // Decode once on mount; later runs happen on change or refresh, as in the original.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decode]);

  return (
    <div className="font-mono text-white">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          decode(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onBlur={() => decode(input)}
          className="w-full max-w-lg border border-white bg-black p-1 font-mono text-white focus:outline-none"
        />
        <button type="submit" aria-label="Decode again" className="text-lg hover:text-gray-300">
          &#8635;
        </button>
      </form>
      <p className="mt-10 min-h-6 break-words whitespace-pre-wrap">{output}</p>
    </div>
  );
}
