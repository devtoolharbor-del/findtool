import { describe, it, expect } from 'vitest';
import {
  parseCsvRows,
  detectDelimiter,
  inferValue,
  csvToJson,
  escapeCsvField,
  serializeCsv,
  flattenRecord,
  toRecordArray,
  csvColumnsFor,
  jsonToCsv,
  SAMPLE_CSV,
  SAMPLE_JSON_ROWS,
} from '~/lib/csv';

describe('parseCsvRows', () => {
  it('splits plain rows and fields', () => {
    expect(parseCsvRows('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps a delimiter that sits inside a quoted field', () => {
    expect(parseCsvRows('name,city\n"Lovelace, Ada",London')).toEqual([
      ['name', 'city'],
      ['Lovelace, Ada', 'London'],
    ]);
  });

  it('treats a doubled quote as one literal quote', () => {
    expect(parseCsvRows('a\n"He said ""hi"""')).toEqual([['a'], ['He said "hi"']]);
  });

  it('keeps newlines that appear inside a quoted field', () => {
    const rows = parseCsvRows('id,note\n1,"line one\nline two"');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['1', 'line one\nline two']);
  });

  it('accepts CRLF line endings and a trailing newline', () => {
    expect(parseCsvRows('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps empty fields rather than collapsing them', () => {
    expect(parseCsvRows('a,,c,')).toEqual([['a', '', 'c', '']]);
  });

  it('strips a leading byte order mark', () => {
    expect(parseCsvRows('﻿id,name\n1,Ada')[0]).toEqual(['id', 'name']);
  });

  it('supports a tab delimiter', () => {
    expect(parseCsvRows('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a quote that appears mid-field literally', () => {
    expect(parseCsvRows('size\n3" pipe')).toEqual([['size'], ['3" pipe']]);
  });

  it('parses the bundled sample without losing a row', () => {
    const rows = parseCsvRows(SAMPLE_CSV);
    expect(rows).toHaveLength(5);
    expect(rows[1]![1]).toBe('Lovelace, Ada');
    expect(rows[4]![1]).toBe('Katherine "Kat" Johnson');
  });

  // ── error cases ──
  it('reports an unterminated quoted field with its line number', () => {
    expect(() => parseCsvRows('a,b\n1,"never closed')).toThrow(/line 2/);
    expect(() => parseCsvRows('a,b\n1,"never closed')).toThrow(/Unterminated quoted field/);
  });

  it('refuses a multi-character delimiter', () => {
    expect(() => parseCsvRows('a,b', '::')).toThrow(/exactly one character/);
  });

  it('refuses a double quote as the delimiter', () => {
    expect(() => parseCsvRows('a,b', '"')).toThrow(/escape character/);
  });
});

describe('detectDelimiter', () => {
  it('finds semicolons in a European export', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n4;5;6')).toBe(';');
  });

  it('finds tabs in TSV', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('finds pipes', () => {
    expect(detectDelimiter('a|b|c\n1|2|3')).toBe('|');
  });

  it('is not fooled by commas inside quoted semicolon-separated fields', () => {
    expect(detectDelimiter('name;city\n"Lovelace, Ada";London\n"Hopper, Grace";NYC')).toBe(';');
  });

  it('falls back to a comma when nothing looks tabular', () => {
    expect(detectDelimiter('just one column\nand another line')).toBe(',');
  });
});

describe('inferValue', () => {
  it('converts integers, decimals and exponents', () => {
    expect(inferValue('42')).toBe(42);
    expect(inferValue('-3.5')).toBe(-3.5);
    expect(inferValue('1e3')).toBe(1000);
  });

  it('converts booleans and null case-insensitively', () => {
    expect(inferValue('true')).toBe(true);
    expect(inferValue('FALSE')).toBe(false);
    expect(inferValue('null')).toBe(null);
  });

  it('treats an empty field as null', () => {
    expect(inferValue('')).toBe(null);
    expect(inferValue('   ')).toBe(null);
  });

  it('keeps leading zeros as text so postcodes survive', () => {
    expect(inferValue('01234')).toBe('01234');
  });

  it('keeps integers that would lose precision as text', () => {
    expect(inferValue('9007199254740993')).toBe('9007199254740993');
  });

  it('leaves ordinary words alone', () => {
    expect(inferValue('pro')).toBe('pro');
    expect(inferValue('2026-01-14')).toBe('2026-01-14');
  });
});

describe('csvToJson', () => {
  it('maps the header row onto object keys', () => {
    const result = csvToJson('id,name\n1,Ada\n2,Grace');
    expect(result.data).toEqual([
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ]);
    expect(result.header).toEqual(['id', 'name']);
    expect(result.rowCount).toBe(2);
  });

  it('returns arrays of values when the header is switched off', () => {
    const result = csvToJson('1,Ada\n2,Grace', { header: false });
    expect(result.data).toEqual([
      [1, 'Ada'],
      [2, 'Grace'],
    ]);
    expect(result.header).toEqual(['column_1', 'column_2']);
  });

  it('keeps everything as strings when inference is off', () => {
    const result = csvToJson('id,ok\n1,true', { inferTypes: false });
    expect(result.data).toEqual([{ id: '1', ok: 'true' }]);
  });

  it('auto-detects the delimiter by default', () => {
    const result = csvToJson('id;name\n1;Ada');
    expect(result.delimiter).toBe(';');
    expect(result.data).toEqual([{ id: 1, name: 'Ada' }]);
  });

  it('pads short rows with null and warns about it', () => {
    const result = csvToJson('a,b,c\n1,2');
    expect(result.data).toEqual([{ a: 1, b: 2, c: null }]);
    expect(result.warnings.join(' ')).toMatch(/fewer fields/);
  });

  it('names extra fields and warns about them', () => {
    const result = csvToJson('a,b\n1,2,3');
    expect(result.data).toEqual([{ a: 1, b: 2, column_3: 3 }]);
    expect(result.warnings.join(' ')).toMatch(/more fields/);
  });

  it('renames duplicate columns instead of dropping data', () => {
    const result = csvToJson('name,name\nAda,Lovelace');
    expect(result.header).toEqual(['name', 'name_2']);
    expect(result.data).toEqual([{ name: 'Ada', name_2: 'Lovelace' }]);
    expect(result.warnings.join(' ')).toMatch(/Duplicate column/);
  });

  it('names empty header cells', () => {
    const result = csvToJson('id,,c\n1,2,3');
    expect(result.header).toEqual(['id', 'column_2', 'c']);
  });

  it('expands dotted headers into nested objects on request', () => {
    const result = csvToJson('id,user.name,user.city\n1,Ada,London', { expandDotted: true });
    expect(result.data).toEqual([{ id: 1, user: { name: 'Ada', city: 'London' } }]);
  });

  it('skips blank lines', () => {
    const result = csvToJson('a,b\n\n1,2\n\n');
    expect(result.rowCount).toBe(1);
  });

  it('returns empty data for empty input', () => {
    const result = csvToJson('');
    expect(result.data).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it('handles the bundled sample end to end', () => {
    const result = csvToJson(SAMPLE_CSV);
    expect(result.rowCount).toBe(4);
    const first = result.data[0] as Record<string, unknown>;
    expect(first.name).toBe('Lovelace, Ada');
    expect(first.seats).toBe(3);
    expect(first.active).toBe(true);
  });

  it('propagates a parse failure instead of returning partial data', () => {
    expect(() => csvToJson('a,b\n1,"oops', { delimiter: ',' })).toThrow(/Unterminated/);
  });
});

describe('escapeCsvField / serializeCsv', () => {
  it('leaves a plain value unquoted', () => {
    expect(escapeCsvField('Ada')).toBe('Ada');
  });

  it('quotes the delimiter, quotes, newlines and padded values', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('two\nlines')).toBe('"two\nlines"');
    expect(escapeCsvField(' padded ')).toBe('" padded "');
  });

  it('does not quote a comma when the delimiter is a semicolon', () => {
    expect(escapeCsvField('a,b', ';')).toBe('a,b');
  });

  it('quotes everything when asked', () => {
    expect(escapeCsvField('Ada', ',', true)).toBe('"Ada"');
  });

  it('serialises rows with configurable line endings', () => {
    expect(serializeCsv([['a', 'b'], [1, 2]], { eol: '\r\n' })).toBe('a,b\r\n1,2');
  });

  it('writes null as the configured placeholder', () => {
    expect(serializeCsv([[null, 'x']], { nullValue: 'NULL' })).toBe('NULL,x');
  });

  it('can prefix a BOM for Excel', () => {
    expect(serializeCsv([['a']], { bom: true }).charCodeAt(0)).toBe(0xfeff);
  });

  it('round-trips through the parser', () => {
    const rows = [
      ['name', 'note'],
      ['Lovelace, Ada', 'said "hi"\nthen left'],
    ];
    expect(parseCsvRows(serializeCsv(rows))).toEqual(rows);
  });
});

describe('flattenRecord', () => {
  it('joins nested keys with dots', () => {
    expect(flattenRecord({ user: { name: 'Ada', address: { city: 'London' } } })).toEqual({
      'user.name': 'Ada',
      'user.address.city': 'London',
    });
  });

  it('indexes array items by default', () => {
    expect(flattenRecord({ tags: ['a', 'b'] })).toEqual({ 'tags.0': 'a', 'tags.1': 'b' });
  });

  it('can join arrays into one cell', () => {
    expect(flattenRecord({ tags: ['a', 'b'] }, { arrayMode: 'join' })).toEqual({ tags: 'a; b' });
  });

  it('can keep arrays as JSON text', () => {
    expect(flattenRecord({ tags: ['a', 'b'] }, { arrayMode: 'json' })).toEqual({
      tags: '["a","b"]',
    });
  });

  it('keeps the column for an empty object or array', () => {
    expect(flattenRecord({ meta: {}, tags: [] })).toEqual({ meta: '', tags: '' });
  });

  it('preserves null rather than dropping the key', () => {
    expect(flattenRecord({ a: null })).toEqual({ a: null });
  });
});

describe('toRecordArray', () => {
  it('wraps a single object as one row', () => {
    expect(toRecordArray({ a: 1 })).toEqual([{ a: 1 }]);
  });

  it('turns primitives into a value column', () => {
    expect(toRecordArray([1, 2])).toEqual([{ value: 1 }, { value: 2 }]);
  });

  it('turns arrays of arrays into numbered columns', () => {
    expect(toRecordArray([['a', 'b']])).toEqual([{ column_1: 'a', column_2: 'b' }]);
  });

  it('refuses a top-level scalar with an explanation', () => {
    expect(() => toRecordArray(42)).toThrow(/top level of this JSON is a number/);
    expect(() => toRecordArray(null)).toThrow(/null/);
  });
});

describe('jsonToCsv', () => {
  it('writes a header and one row per object', () => {
    expect(jsonToCsv([{ id: 1, name: 'Ada' }])).toBe('id,name\n1,Ada');
  });

  it('unions keys across records with different shapes', () => {
    const csv = jsonToCsv([{ a: 1 }, { b: 2 }]);
    expect(csv).toBe('a,b\n1,\n,2');
  });

  it('flattens nested objects into dotted headers', () => {
    const csv = jsonToCsv([{ id: 1, user: { name: 'Ada' } }]);
    expect(csv.split('\n')[0]).toBe('id,user.name');
  });

  it('honours an explicit column selection and order', () => {
    const csv = jsonToCsv([{ a: 1, b: 2, c: 3 }], { columns: ['c', 'a'] });
    expect(csv).toBe('c,a\n3,1');
  });

  it('can omit the header row', () => {
    expect(jsonToCsv([{ a: 1 }], { header: false })).toBe('1');
  });

  it('uses the chosen delimiter and quotes accordingly', () => {
    expect(jsonToCsv([{ a: 'x;y' }], { delimiter: ';' })).toBe('a\n"x;y"');
  });

  it('returns an empty string for an empty array', () => {
    expect(jsonToCsv([])).toBe('');
  });

  it('converts the bundled sample and lists every column', () => {
    const value = JSON.parse(SAMPLE_JSON_ROWS);
    expect(csvColumnsFor(value)).toEqual([
      'id',
      'name',
      'contact.email',
      'contact.country',
      'plan',
      'seats',
      'active',
      'trial_ends',
    ]);
    const lines = jsonToCsv(value).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]!.endsWith(',')).toBe(true); // first record has no trial_ends
  });

  it('round-trips a flat array back to the same records', () => {
    const value = [
      { id: 1, name: 'Lovelace, Ada', active: true },
      { id: 2, name: 'Hopper "Amazing" Grace', active: false },
    ];
    expect(csvToJson(jsonToCsv(value)).data).toEqual(value);
  });
});
