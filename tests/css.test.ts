import { describe, expect, it } from 'vitest';
import { CssParseError, SAMPLE_CSS, minifyCss, minifyNumber, tokenizeCss } from '~/lib/css';

const min = (css: string, options?: Parameters<typeof minifyCss>[1]) =>
  minifyCss(css, options).css;

describe('whitespace and comments', () => {
  it('collapses formatting', () => {
    expect(min('a   {\n  color :  red ;\n}')).toBe('a{color:red}');
  });

  it('drops the last semicolon in a block', () => {
    expect(min('a{color:red;background:blue;}')).toBe('a{color:red;background:blue}');
    expect(min('a{color:red;;}')).toBe('a{color:red;}');
  });

  it('removes ordinary comments', () => {
    expect(min('/* header */ a { color: red } /* footer */')).toBe('a{color:red}');
  });

  it('keeps /*! licence banners by default', () => {
    const result = minifyCss('/*! (c) 2026 FindTool */\na{color:red}');
    expect(result.css).toContain('/*! (c) 2026 FindTool */');
    expect(result.licencesKept).toBe(1);
  });

  it('drops licence banners when asked', () => {
    const result = minifyCss('/*! (c) 2026 */a{color:red}', { preserveLicenceComments: false });
    expect(result.css).toBe('a{color:red}');
    expect(result.licencesKept).toBe(0);
    expect(result.commentsRemoved).toBe(1);
  });

  it('does not fuse two idents that a comment was separating', () => {
    expect(min('a{margin:1px/**/2px}')).toBe('a{margin:1px 2px}');
  });
});

describe('strings survive intact', () => {
  it('keeps braces and semicolons inside a string', () => {
    expect(min('a::after{content:"a; b { c } d"}')).toBe('a::after{content:"a; b { c } d"}');
  });

  it('keeps a comment-like sequence inside a string', () => {
    const css = 'a::after{content:"/* not a comment */"}';
    expect(min(css)).toBe(css);
  });

  it('keeps a closing brace inside a string', () => {
    expect(min('a::before{content:"};"}')).toBe('a::before{content:"};"}');
  });

  it('keeps whitespace inside a string', () => {
    expect(min('a{content:"two    spaces"}')).toBe('a{content:"two    spaces"}');
  });

  it('keeps an escaped quote inside a string', () => {
    const css = String.raw`a{content:"she said \"hi\""}`;
    expect(min(css)).toBe(css);
  });

  it('does not touch numbers inside a string', () => {
    expect(min('a{content:"0.50"}')).toBe('a{content:"0.50"}');
  });

  it('handles single quotes the same way', () => {
    expect(min("a{content:'{;}'}")).toBe("a{content:'{;}'}");
  });
});

describe('url() survives intact', () => {
  it('keeps brackets inside an unquoted url', () => {
    const css = 'a{background:url(images/hero(1).png)}';
    expect(min(css)).toBe(css);
  });

  it('keeps semicolons and comment-like sequences inside a url', () => {
    const css = 'a{background:url(data:image/svg+xml;base64,PHN2Zy8+)}';
    expect(min(css)).toBe(css);
  });

  it('keeps a url containing braces', () => {
    const css = 'a{background:url(/img/{id}/cover.png)}';
    expect(min(css)).toBe(css);
  });

  it('keeps a quoted url too', () => {
    expect(min('a{background:url( "a b;c.png" )}')).toBe('a{background:url("a b;c.png")}');
  });

  it('does not rewrite numbers inside a url', () => {
    const css = 'a{background:url(sprite-0.50x.png)}';
    expect(min(css)).toBe(css);
  });
});

describe('custom properties are preserved verbatim', () => {
  it('keeps a value that is not valid CSS at all', () => {
    expect(min('a{--json: {"a": 1; "b": 2};color:red}')).toBe(
      'a{--json:{"a": 1; "b": 2};color:red}',
    );
  });

  it('keeps internal spacing in a custom property value', () => {
    expect(min(':root{  --gap:  1rem   2rem ;  }')).toBe(':root{--gap:1rem   2rem}');
  });

  it('still minifies ordinary declarations around it', () => {
    expect(min(':root{--x: 0.50rem; margin: 0.50rem}')).toBe(':root{--x:0.50rem;margin:.5rem}');
  });

  it('handles an empty custom property value', () => {
    expect(min('a{--x:;color:red}')).toBe('a{--x:;color:red}');
  });
});

describe('numbers', () => {
  it('drops leading and trailing zeros', () => {
    expect(minifyNumber('0.5')).toBe('.5');
    expect(minifyNumber('-0.5')).toBe('-.5');
    expect(minifyNumber('0.50px')).toBe('.5px');
    expect(minifyNumber('1.0')).toBe('1');
    expect(minifyNumber('1.50em')).toBe('1.5em');
    expect(minifyNumber('010px')).toBe('10px');
  });

  it('leaves a bare zero and keeps its unit', () => {
    expect(minifyNumber('0')).toBe('0');
    expect(minifyNumber('0px')).toBe('0px');
    expect(minifyNumber('0.0')).toBe('0');
  });

  it('leaves scientific notation alone', () => {
    expect(minifyNumber('1e3')).toBe('1e3');
  });

  it('applies inside a stylesheet', () => {
    expect(min('a{opacity:0.50;margin:0.5rem -0.250rem}')).toBe('a{opacity:.5;margin:.5rem -.25rem}');
  });

  it('does not break nth-child arguments', () => {
    expect(min('li:nth-child(2n + 1){color:red}')).toBe('li:nth-child(2n+1){color:red}');
  });
});

describe('selectors and at-rules', () => {
  it('tightens combinators', () => {
    expect(min('.a   >   .b ,  .c  +  .d  ~  .e { color : red }')).toBe(
      '.a>.b,.c+.d~.e{color:red}',
    );
  });

  it('keeps the descendant combinator before a pseudo-class', () => {
    expect(min('div :hover{color:red}')).toBe('div :hover{color:red}');
    expect(min('div:hover{color:red}')).toBe('div:hover{color:red}');
  });

  it('tightens attribute selectors without losing the case flag', () => {
    expect(min('a[href ^= "https"]{color:red}')).toBe('a[href^="https"]{color:red}');
    expect(min('a[href $= ".pdf" i]{color:red}')).toBe('a[href$=".pdf" i]{color:red}');
  });

  it('keeps the space before a media query bracket', () => {
    expect(min('@media screen and (min-width: 48rem) { a { color : red } }')).toBe(
      '@media screen and (min-width:48rem){a{color:red}}',
    );
  });

  it('handles nested rules', () => {
    expect(min('.card { color: red; & .title { font-weight: 700 } }')).toBe(
      '.card{color:red;& .title{font-weight:700}}',
    );
  });

  it('keeps @import and @charset intact', () => {
    expect(min('@charset "utf-8";\n@import url(base.css);')).toBe(
      '@charset "utf-8";@import url(base.css);',
    );
  });
});

describe('calc and value operators', () => {
  it('keeps the whitespace calc() requires around + and -', () => {
    expect(min('a{width:calc(100% - 2rem)}')).toBe('a{width:calc(100% - 2rem)}');
    expect(min('a{width:calc(100% + 1px)}')).toBe('a{width:calc(100% + 1px)}');
    expect(min('a{width:calc( 100%  -  2rem )}')).toBe('a{width:calc(100% - 2rem)}');
  });

  it('does not add whitespace where a negative number already sits', () => {
    expect(min('a{margin:0 -2px}')).toBe('a{margin:0 -2px}');
    expect(min('a{transform:translateX( -2px )}')).toBe('a{transform:translateX(-2px)}');
  });

  it('tightens the slash in modern colour and shorthand syntax', () => {
    expect(min('a{color:rgb(0 0 0 / 50%)}')).toBe('a{color:rgb(0 0 0/50%)}');
    expect(min('a{font:12px / 1.5 sans-serif}')).toBe('a{font:12px/1.5 sans-serif}');
  });

  it('tightens !important', () => {
    expect(min('a{color:red !important}')).toBe('a{color:red!important}');
  });

  it('keeps multi-value whitespace that carries meaning', () => {
    expect(min('a{margin:1px 2px 3px 4px}')).toBe('a{margin:1px 2px 3px 4px}');
    expect(min('a{border:1px solid red}')).toBe('a{border:1px solid red}');
    expect(min('a{font-family:"Helvetica Neue" ,  Arial ,  sans-serif}')).toBe(
      'a{font-family:"Helvetica Neue",Arial,sans-serif}',
    );
  });
});

describe('malformed input', () => {
  it('refuses an unterminated comment', () => {
    expect(() => minifyCss('a{color:red} /* never closed')).toThrow(CssParseError);
    expect(() => minifyCss('a{color:red} /* never closed')).toThrow(/never closed/);
  });

  it('refuses an unterminated string', () => {
    expect(() => minifyCss('a{content:"oops}')).toThrow(CssParseError);
  });

  it('refuses a string broken by a raw newline', () => {
    expect(() => minifyCss('a{content:"line\nbreak"}')).toThrow(/raw line break/);
  });

  it('refuses an unterminated url()', () => {
    expect(() => minifyCss('a{background:url(never-closed.png}')).toThrow(/url\( is never closed/);
  });

  it('refuses unbalanced braces in both directions', () => {
    expect(() => minifyCss('a{color:red')).toThrow(/still open/);
    expect(() => minifyCss('a{color:red}}')).toThrow(/no matching \{/);
  });

  it('reports the line number', () => {
    try {
      minifyCss('a{color:red}\n\nb{content:"oops}');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CssParseError);
      expect((err as CssParseError).line).toBe(3);
    }
  });

  it('passes an unknown character through rather than refusing the file', () => {
    expect(min('a{color:red}§{color:blue}')).toBe('a{color:red}§{color:blue}');
  });
});

describe('statistics', () => {
  it('reports sizes and savings', () => {
    const result = minifyCss('a {\n  color: red;\n}\n');
    expect(result.minifiedBytes).toBe('a{color:red}'.length);
    expect(result.originalBytes).toBeGreaterThan(result.minifiedBytes);
    expect(result.saved).toBe(result.originalBytes - result.minifiedBytes);
    expect(result.savedPercent).toBeGreaterThan(0);
    expect(result.blocks).toBe(1);
  });

  it('counts bytes, not characters', () => {
    const result = minifyCss('a{content:"→"}');
    expect(result.minifiedBytes).toBe(16); // the arrow is three UTF-8 bytes
  });

  it('handles an empty stylesheet without dividing by zero', () => {
    const result = minifyCss('');
    expect(result.css).toBe('');
    expect(result.savedPercent).toBe(0);
  });
});

describe('the bundled example', () => {
  it('minifies without error and keeps every hazard intact', () => {
    const result = minifyCss(SAMPLE_CSS);
    expect(result.css).toContain('/*! FindTool demo stylesheet v1.0 | MIT licence */');
    expect(result.css).not.toContain('This comment is removed');
    expect(result.css).toContain('"a; b { c } /* not a comment */"');
    expect(result.css).toContain('url(images/hero(1).png)');
    expect(result.css).toContain('content:"};"');
    expect(result.css).toContain('calc(100% - 2rem)');
    expect(result.css).toContain('opacity:.5');
    expect(result.saved).toBeGreaterThan(0);
  });

  it('is idempotent — minifying the result changes nothing', () => {
    const once = minifyCss(SAMPLE_CSS).css;
    expect(minifyCss(once).css).toBe(once);
  });
});

describe('tokenizer', () => {
  it('labels each token', () => {
    const types = tokenizeCss('a{color:#fff;width:calc(1px + 2px)}').map((t) => t.type);
    expect(types).toContain('ident');
    expect(types).toContain('number');
    expect(types).toContain('punct');
  });

  it('treats an unquoted url as one token', () => {
    const urls = tokenizeCss('a{background:url(a(1).png)}').filter((t) => t.type === 'url');
    expect(urls).toHaveLength(1);
    expect(urls[0]!.value).toBe('url(a(1).png)');
  });

  it('marks licence comments', () => {
    const comments = tokenizeCss('/*! keep */ /* drop */').filter((t) => t.type === 'comment');
    expect(comments.map((c) => c.licence)).toEqual([true, false]);
  });

  it('tracks line numbers', () => {
    const tokens = tokenizeCss('a\n\nb');
    expect(tokens[tokens.length - 1]!.line).toBe(3);
  });
});
