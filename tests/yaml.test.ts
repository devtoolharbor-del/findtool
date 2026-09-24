import { describe, it, expect } from 'vitest';
import {
  parseYaml,
  parseAllYaml,
  countYamlDocuments,
  yamlToJson,
  jsonToYaml,
  dumpYaml,
  dumpYamlDocuments,
  describeYamlError,
  looksLikeJson,
  YamlParseError,
  SAMPLE_YAML,
  SAMPLE_JSON_FOR_YAML,
} from '~/lib/yaml';

describe('parseYaml', () => {
  it('parses a mapping with scalars of several types', () => {
    expect(parseYaml('name: checkout\nreplicas: 3\nenabled: true\nnotes: null')).toEqual({
      name: 'checkout',
      replicas: 3,
      enabled: true,
      notes: null,
    });
  });

  it('parses nested blocks and sequences', () => {
    expect(parseYaml('spec:\n  ports:\n    - 80\n    - 443')).toEqual({
      spec: { ports: [80, 443] },
    });
  });

  it('resolves anchors and aliases', () => {
    const value = parseYaml(
      'defaults: &d\n  cpu: 500m\n  memory: 512Mi\nlimits: *d\nrequests: *d',
    ) as Record<string, unknown>;
    expect(value.limits).toEqual({ cpu: '500m', memory: '512Mi' });
    expect(value.requests).toEqual(value.limits);
  });

  it('keeps a quoted number as a string', () => {
    expect(parseYaml('port: "8080"')).toEqual({ port: '8080' });
  });

  it('parses block scalars', () => {
    expect(parseYaml('script: |\n  line one\n  line two')).toEqual({
      script: 'line one\nline two\n',
    });
  });

  it('has no value for an empty document', () => {
    expect(parseYaml('')).toBeUndefined();
    // js-yaml resolves a comment-only document to an explicit null.
    expect(parseYaml('# only a comment')).toBeNull();
  });

  it('explains that a stream holds more than one document', () => {
    let detail: any;
    try {
      parseYaml('a: 1\n---\nb: 2');
    } catch (err) {
      detail = (err as YamlParseError).detail;
    }
    expect(detail.message).toMatch(/more than one document/);
  });

  it('parses the bundled Kubernetes sample', () => {
    const value = parseYaml(SAMPLE_YAML) as any;
    expect(value.kind).toBe('Deployment');
    expect(value.spec.replicas).toBe(3);
    expect(value.spec.template.spec.containers[0].env[1].value).toBe('2500');
    expect(value.spec.template.spec.containers[0].resources.requests).toEqual({
      cpu: '500m',
      memory: '512Mi',
    });
  });

  // ── error cases ──
  it('throws YamlParseError with a line number for bad indentation', () => {
    let thrown: unknown;
    try {
      parseYaml('a:\n  b: 1\n   c: 2\n');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(YamlParseError);
    const detail = (thrown as YamlParseError).detail;
    expect(detail.line).toBeGreaterThan(1);
    expect(detail.message.length).toBeGreaterThan(10);
  });

  it('explains a tab used for indentation', () => {
    let detail: any;
    try {
      parseYaml('root:\n\tchild: 1\n');
    } catch (err) {
      detail = (err as YamlParseError).detail;
    }
    expect(detail.message).toMatch(/tab/i);
  });

  it('explains an unresolved alias', () => {
    let detail: any;
    try {
      parseYaml('a: *missing\n');
    } catch (err) {
      detail = (err as YamlParseError).detail;
    }
    expect(detail.message).toMatch(/anchor|alias/i);
  });

  it('reports an unterminated quoted scalar', () => {
    let detail: any;
    try {
      parseYaml('name: "never closed\nother: 1\n');
    } catch (err) {
      detail = (err as YamlParseError).detail;
    }
    expect(detail.message.length).toBeGreaterThan(10);
    expect(detail.line).toBeDefined();
  });

  it('rejects a duplicate mapping key', () => {
    expect(() => parseYaml('a: 1\na: 2\n')).toThrow(YamlParseError);
  });

  it('refuses to construct anything from a custom tag', () => {
    expect(() => parseYaml('value: !!js/function "function () {}"')).toThrow(YamlParseError);
  });
});

describe('describeYamlError', () => {
  it('passes a non-YAML error through with its own message', () => {
    expect(describeYamlError(new Error('boom')).message).toBe('boom');
  });

  it('has a fallback message for a non-Error value', () => {
    expect(describeYamlError(undefined).message).toMatch(/could not be parsed/);
  });
});

describe('parseAllYaml', () => {
  it('reads every document in a stream', () => {
    expect(parseAllYaml('kind: A\n---\nkind: B\n---\nkind: C')).toEqual([
      { kind: 'A' },
      { kind: 'B' },
      { kind: 'C' },
    ]);
  });

  it('counts documents', () => {
    expect(countYamlDocuments('a: 1\n---\nb: 2')).toBe(2);
    expect(countYamlDocuments('a: 1')).toBe(1);
  });

  it('reports an error in the second document', () => {
    expect(() => parseAllYaml('a: 1\n---\nb:\n\tc: 2')).toThrow(YamlParseError);
  });
});

describe('yamlToJson', () => {
  it('produces indented JSON', () => {
    expect(yamlToJson('a: 1')).toBe('{\n  "a": 1\n}');
  });

  it('honours the indent width', () => {
    expect(yamlToJson('a: 1', { indent: 4 })).toBe('{\n    "a": 1\n}');
  });

  it('wraps a multi-document stream in an array', () => {
    expect(JSON.parse(yamlToJson('a: 1\n---\nb: 2'))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('does not wrap a single document in an array', () => {
    expect(JSON.parse(yamlToJson('a: 1'))).toEqual({ a: 1 });
  });

  it('only reads the first document when multiDocument is off', () => {
    expect(JSON.parse(yamlToJson('a: 1\n---\nb: 2', { multiDocument: false }))).toEqual({ a: 1 });
  });

  it('writes null for an empty document rather than undefined', () => {
    expect(yamlToJson('')).toBe('null');
  });

  it('expands aliases into repeated JSON values', () => {
    const json = JSON.parse(yamlToJson('base: &b\n  x: 1\ncopy: *b')) as any;
    expect(json.copy).toEqual({ x: 1 });
  });
});

describe('jsonToYaml / dumpYaml', () => {
  it('writes a simple mapping', () => {
    expect(jsonToYaml({ name: 'checkout', replicas: 3 })).toBe('name: checkout\nreplicas: 3\n');
  });

  it('honours the indent width', () => {
    expect(jsonToYaml({ a: { b: 1 } }, { indent: 4 })).toBe('a:\n    b: 1\n');
  });

  it('sorts keys on request', () => {
    expect(jsonToYaml({ b: 1, a: 2 }, { sortKeys: true })).toBe('a: 2\nb: 1\n');
    expect(jsonToYaml({ b: 1, a: 2 })).toBe('b: 1\na: 2\n');
  });

  it('quotes strings that would otherwise read as another type', () => {
    expect(jsonToYaml({ version: '1.0', yes: 'true', port: '80' })).toContain("version: '1.0'");
    expect(jsonToYaml({ yes: 'true' })).toContain("yes: 'true'");
  });

  it('can force double quotes everywhere', () => {
    expect(jsonToYaml({ a: 'x' }, { forceQuotes: true, quotingType: '"' })).toBe('a: "x"\n');
  });

  it('does not emit anchors by default', () => {
    const shared = { cpu: '500m' };
    const out = jsonToYaml({ limits: shared, requests: shared });
    expect(out).not.toContain('&ref');
    expect(out).toContain('requests:');
  });

  it('emits anchors when asked', () => {
    const shared = { cpu: '500m' };
    expect(jsonToYaml({ limits: shared, requests: shared }, { anchors: true })).toMatch(/&ref_0/);
  });

  it('keeps long strings on one line by default', () => {
    const long = 'x'.repeat(200);
    expect(jsonToYaml({ note: long }).trim().split('\n')).toHaveLength(1);
  });

  it('writes a multi-document stream from an array', () => {
    expect(dumpYamlDocuments([{ a: 1 }, { b: 2 }])).toBe('---\na: 1\n---\nb: 2\n');
    expect(jsonToYaml([{ a: 1 }, { b: 2 }], { multiDocument: true })).toContain('---');
  });

  it('writes a normal sequence when multiDocument is off', () => {
    expect(jsonToYaml([{ a: 1 }, { b: 2 }])).toBe('- a: 1\n- b: 2\n');
  });

  it('returns an empty string for undefined', () => {
    expect(dumpYaml(undefined)).toBe('');
  });

  it('refuses a circular structure with a readable message', () => {
    const node: Record<string, unknown> = { name: 'a' };
    node.self = node;
    expect(() => dumpYaml(node, { anchors: false })).toThrow(/circular|cannot be represented/i);
  });

  it('round-trips the bundled JSON sample', () => {
    const value = JSON.parse(SAMPLE_JSON_FOR_YAML);
    expect(parseYaml(jsonToYaml(value))).toEqual(value);
  });

  it('round-trips the bundled YAML sample through JSON', () => {
    const value = parseYaml(SAMPLE_YAML);
    expect(parseYaml(jsonToYaml(value))).toEqual(value);
  });
});

describe('looksLikeJson', () => {
  it('recognises objects and arrays', () => {
    expect(looksLikeJson('  {"a":1} ')).toBe(true);
    expect(looksLikeJson('[1,2]')).toBe(true);
  });

  it('rejects YAML', () => {
    expect(looksLikeJson('a: 1')).toBe(false);
  });
});
