var e=`/*
 * Numeric base converter: type a whole number in any base and every other
 * base updates as you type.
 *
 * A number is the same value whatever base writes it; the base only decides
 * the place values. In base B the digits d_k … d_1 d_0 mean
 *
 *     d_k·B^k + … + d_1·B^1 + d_0·B^0
 *
 * so parsing is Horner's rule (value = value·B + digit, left to right) and
 * printing is the reverse, repeated division by B. The breakdown panel shows
 * that sum for the base you are editing.
 *
 * All arithmetic is BigInt, so numbers of any length convert exactly (plain
 * JS numbers lose integers past 2^53). BigInt's toString(radix) already
 * prints bases 2–36 with digits 0–9 then A–Z; parsing is done by hand so a bad
 * digit can be reported precisely. Base 1 is tally notation: n ones.
 *
 * State is one value plus the row being edited. The edited row keeps exactly
 * what was typed (even when it is invalid, so the user can fix it); every
 * other row is derived from the value.
 */
import { useEffect, useState } from 'react';

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALL_BASES = Array.from({ length: 36 }, (_, i) => i + 1);
const DEFAULT_BASES = ALL_BASES.slice(0, 16); // The original pen showed 1–16.
const BASE_SETS = { Common: [2, 8, 10, 16], '1–16': DEFAULT_BASES, All: ALL_BASES };
const BASE_NAMES = { 1: 'tally', 2: 'binary', 8: 'octal', 10: 'decimal', 12: 'duodecimal', 16: 'hex', 36: 'base36' };
const TALLY_LIMIT = 256n; // Tally of a big number would be a huge string.
const BREAKDOWN_TERMS = 12;
const STORAGE_KEY = 'base-converter:bases';

// ---- Conversion (pure) -----------------------------------------------------

// Parse \`text\` in \`base\`. Spaces and underscores are ignored so grouped or
// pasted numbers work. Returns { value } (null for empty input) or { error }.
function parse(text, base) {
  const clean = text.replace(/[\\s_]/g, '').toUpperCase();
  const negative = clean.startsWith('-');
  const body = negative ? clean.slice(1) : clean;
  if (body === '') return { value: null };

  if (base === 1) {
    if (!/^1+$/.test(body)) return { error: 'Tally uses only the digit 1' };
    const value = BigInt(body.length);
    return { value: negative ? -value : value };
  }

  const B = BigInt(base);
  let value = 0n;
  for (const ch of body) {
    const digit = DIGITS.indexOf(ch);
    if (digit < 0 || digit >= base) return { error: \`“\${ch}” is not a base-\${base} digit\` };
    value = value * B + BigInt(digit); // Horner's rule
  }
  return { value: negative ? -value : value };
}

function format(value, base) {
  if (value === null) return '';
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  if (base === 1) return magnitude > TALLY_LIMIT ? null : sign + '1'.repeat(Number(magnitude));
  return sign + magnitude.toString(base).toUpperCase();
}

const superscript = (n) => String(n).replace(/\\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);

// The place-value expansion of a positional numeral, most significant first.
function placeTerms(text) {
  const digits = text.replace(/[\\s_-]/g, '').toUpperCase().replace(/^0+(?=.)/, '');
  return [...digits].map((ch, i) => ({ digit: DIGITS.indexOf(ch), power: digits.length - 1 - i }));
}

// ---- Persistence -----------------------------------------------------------

function loadBases() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.every((b) => ALL_BASES.includes(b))) return saved;
  } catch {
    // Storage blocked or corrupt: fall back to the defaults.
  }
  return DEFAULT_BASES;
}

// ---- Components ------------------------------------------------------------

function Breakdown({ text, base, value }) {
  if (value === null || base === 1) return null;
  const terms = placeTerms(text);
  const shown = terms.slice(0, BREAKDOWN_TERMS);
  const hidden = terms.length - shown.length;
  return (
    <div className="rounded border border-gray-800 bg-gray-900 p-3 font-mono text-sm text-gray-300">
      <div className="mb-1 text-xs text-gray-500">Place values in base {base}</div>
      <div className="break-words">
        {value < 0n && '−('}
        {shown.map(({ digit, power }, i) => (
          <span key={i} className={digit === 0 ? 'text-gray-600' : undefined}>
            {i > 0 && ' + '}
            {digit}·{base}
            {superscript(power)}
          </span>
        ))}
        {hidden > 0 && <span className="text-gray-500"> + … ({hidden} more)</span>}
        {value < 0n && ')'}
      </div>
      <div className="mt-1 break-all text-gray-400">= {value.toString()} in decimal</div>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (insecure context, denied permission).
    }
  };
  return (
    <button type="button" onClick={copy} disabled={!text}
      className="w-14 shrink-0 rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-30">
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function BaseConverter() {
  const [value, setValue] = useState(255n);
  const [editing, setEditing] = useState({ base: 10, text: '255', error: null });
  const [bases, setBases] = useState(loadBases);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bases));
    } catch {
      // Not persisting is fine.
    }
  }, [bases]);

  const handleInput = (base, raw) => {
    const text = raw.toUpperCase();
    const result = parse(text, base);
    // On an error the other rows keep the last good value.
    setEditing({ base, text, error: result.error ?? null });
    if (!result.error) setValue(result.value);
  };

  const toggleBase = (base) =>
    setBases((current) =>
      current.includes(base) ? current.filter((b) => b !== base) : [...current, base].sort((a, b) => a - b),
    );

  const shownBases = bases.includes(editing.base) ? bases : [...bases, editing.base].sort((a, b) => a - b);
  const chip = 'rounded px-1.5 py-0.5 font-mono text-xs';

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm text-gray-300">Bases to show</legend>
        <div className="flex flex-wrap gap-1">
          {ALL_BASES.map((base) => (
            <button key={base} type="button" aria-pressed={bases.includes(base)} onClick={() => toggleBase(base)}
              title={BASE_NAMES[base]}
              className={\`\${chip} w-7 \${bases.includes(base) ? 'bg-gray-300 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}\`}>
              {base}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(BASE_SETS).map(([name, set]) => (
            <button key={name} type="button" onClick={() => setBases(set)}
              className={\`\${chip} bg-gray-800 text-gray-300 hover:bg-gray-700\`}>
              {name}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1">
        {shownBases.map((base) => {
          const isEditing = editing.base === base;
          const derived = format(value, base);
          const text = isEditing ? editing.text : derived ?? '';
          const invalid = isEditing && editing.error;
          return (
            <div key={base} className="flex items-center gap-2">
              <label htmlFor={\`base-\${base}\`} className="w-20 shrink-0 text-right text-xs text-gray-500">
                {base}
                {BASE_NAMES[base] && <span className="block text-[10px] leading-none">{BASE_NAMES[base]}</span>}
              </label>
              <input
                id={\`base-\${base}\`}
                type="text"
                inputMode={base <= 10 ? 'numeric' : 'text'}
                value={text}
                placeholder={derived === null ? 'too long for tally' : ''}
                onChange={(e) => handleInput(base, e.target.value)}
                onFocus={() => !isEditing && setEditing({ base, text, error: null })}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={Boolean(invalid)}
                aria-describedby={invalid ? 'base-error' : undefined}
                className={
                  'min-w-0 flex-1 border-l bg-black px-1 py-0.5 font-mono text-white focus:outline-none ' +
                  (invalid ? 'border border-orange-500' : isEditing ? 'border-gray-300' : 'border-gray-600')
                }
              />
              <span className="hidden w-12 shrink-0 text-right text-[10px] text-gray-600 sm:block" title="digits">
                {text.replace('-', '').length || ''}
              </span>
              <CopyButton text={text} />
            </div>
          );
        })}
      </div>

      {editing.error && (
        <p id="base-error" role="alert" className="text-sm text-orange-400">
          {editing.error}
        </p>
      )}
      {!editing.error && <Breakdown text={editing.text} base={editing.base} value={value} />}
    </div>
  );
}
`;export{e as default};