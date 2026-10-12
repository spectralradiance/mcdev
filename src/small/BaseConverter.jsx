import { useState } from 'react';

// Converts through base 10, so values above Number.MAX_SAFE_INTEGER are rejected.
const charSet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nBases = 16;

function toBase10(num, base) {
  if (base === 1) return num.length;
  let r = 0;
  for (let i = 0; i < num.length; ++i) {
    r += charSet.indexOf(num.charAt(i)) * Math.pow(base, num.length - i - 1);
  }
  return r;
}

function fromBase10(num, toBase) {
  let r = '';
  if (toBase === 1) {
    // Unary is capped so a large number doesn't produce a huge string.
    return charSet.charAt(0).repeat(Math.min(num, 200));
  }
  while (num > 0) {
    r = charSet.charAt(num % toBase) + r;
    num = Math.floor(num / toBase);
  }
  return r;
}

function isValid(num, base) {
  for (let i = 0; i < num.length; ++i) {
    const v = charSet.indexOf(num.charAt(i));
    // Unary is written with zeros, so its one digit is 0.
    if (v < 0 || v >= Math.max(base, 1)) return false;
  }
  return true;
}

const initialRows = Array.from({ length: nBases }, (_, i) => ({
  base: i + 1,
  num: i === 0 ? '' : '0',
  valid: true,
}));

export default function BaseConverter() {
  const [rows, setRows] = useState(initialRows);

  const update = (base, value) => {
    const num = value.toUpperCase();
    const v = isValid(num, base) ? toBase10(num, base) : null;
    if (v === null || v >= Number.MAX_SAFE_INTEGER) {
      setRows((current) => current.map((row) => (row.base === base ? { ...row, num, valid: false } : row)));
      return;
    }
    setRows((current) => current.map((row) => ({ ...row, num: fromBase10(v, row.base), valid: true })));
  };

  return (
    <table className="w-full font-mono text-white">
      <tbody>
        {rows.map((row) => (
          <tr key={row.base}>
            <td className="w-10 pr-2 text-right align-middle text-xs text-gray-500">{row.base}</td>
            <td>
              <input
                type="text"
                aria-label={`Base ${row.base}`}
                value={row.num}
                onChange={(event) => update(row.base, event.target.value)}
                spellCheck={false}
                className={
                  'w-full border-l bg-black px-1 py-0.5 font-mono text-white focus:outline-none ' +
                  (row.valid ? 'border-gray-500' : 'border border-orange-500')
                }
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
