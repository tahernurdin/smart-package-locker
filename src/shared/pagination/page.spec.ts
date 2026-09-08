import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  resolvePageRequest,
  toPage,
} from './page.js';

describe('resolvePageRequest', () => {
  it('defaults an unasked-for window', () => {
    expect(resolvePageRequest()).toEqual({
      limit: DEFAULT_PAGE_LIMIT,
      offset: 0,
    });
    expect(resolvePageRequest({})).toEqual({
      limit: DEFAULT_PAGE_LIMIT,
      offset: 0,
    });
  });

  it('keeps a legal window as asked', () => {
    expect(resolvePageRequest({ limit: 10, offset: 30 })).toEqual({
      limit: 10,
      offset: 30,
    });
  });

  // The DTO's @Max only binds callers that came through the HTTP pipe.
  it('clamps a limit past the ceiling instead of scanning the table', () => {
    expect(resolvePageRequest({ limit: 10_000 }).limit).toBe(MAX_PAGE_LIMIT);
    expect(resolvePageRequest({ limit: 0 }).limit).toBe(1);
    expect(resolvePageRequest({ limit: -5 }).limit).toBe(1);
  });

  it('floors a negative offset at zero', () => {
    expect(resolvePageRequest({ offset: -20 }).offset).toBe(0);
  });

  it('truncates fractions — LIMIT takes whole rows', () => {
    expect(resolvePageRequest({ limit: 10.9, offset: 5.5 })).toEqual({
      limit: 10,
      offset: 5,
    });
  });

  it('falls back when a non-number slips past validation', () => {
    expect(
      resolvePageRequest({ limit: Number.NaN, offset: Number.NaN }),
    ).toEqual({ limit: DEFAULT_PAGE_LIMIT, offset: 0 });
    expect(resolvePageRequest({ limit: Number.POSITIVE_INFINITY }).limit).toBe(
      DEFAULT_PAGE_LIMIT,
    );
  });
});

describe('toPage', () => {
  it('reports the total behind the window, not the items on it', () => {
    expect(toPage(['a', 'b'], 57, { limit: 2, offset: 4 })).toEqual({
      items: ['a', 'b'],
      total: 57,
      limit: 2,
      offset: 4,
    });
  });
});
