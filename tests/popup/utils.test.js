const {
  formatRelativeTime, escapeHtml, normalizeURL,
  extractDomain, isLoginPage, extractBaseDomain,
  getGroupColor, getLoginTooltip,
} = require('../../popup.js');

describe('formatRelativeTime', () => {
  it('returns null for falsy input', () => {
    expect(formatRelativeTime(null)).toBeNull();
    expect(formatRelativeTime(undefined)).toBeNull();
    expect(formatRelativeTime(0)).toBeNull();
  });

  it('returns "Just now" for timestamps within 60 seconds', () => {
    const result = formatRelativeTime(Date.now() - 30000);
    expect(result).toBe('Just now');
  });

  it('returns minutes ago', () => {
    const result = formatRelativeTime(Date.now() - 5 * 60 * 1000);
    expect(result).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const result = formatRelativeTime(Date.now() - 3 * 3600 * 1000);
    expect(result).toBe('3h ago');
  });

  it('returns days ago', () => {
    const result = formatRelativeTime(Date.now() - 2 * 86400 * 1000);
    expect(result).toBe('2d ago');
  });

  it('returns weeks ago', () => {
    const result = formatRelativeTime(Date.now() - 14 * 86400 * 1000);
    expect(result).toBe('2w ago');
  });

  it('returns months ago', () => {
    const result = formatRelativeTime(Date.now() - 60 * 86400 * 1000);
    expect(result).toBe('2mo ago');
  });
});

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes all special characters together', () => {
    expect(escapeHtml('<script>"alert&</script>')).toBe(
      '&lt;script&gt;&quot;alert&amp;&lt;/script&gt;'
    );
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('normalizeURL', () => {
  it('removes trailing slash', () => {
    expect(normalizeURL('https://example.com/')).toBe('https://example.com');
  });

  it('leaves URL without trailing slash unchanged', () => {
    expect(normalizeURL('https://example.com')).toBe('https://example.com');
  });

  it('returns null for null input', () => {
    expect(normalizeURL(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(normalizeURL(undefined)).toBeUndefined();
  });

  it('returns empty string for empty string', () => {
    expect(normalizeURL('')).toBe('');
  });
});

describe('extractDomain', () => {
  it('extracts hostname from valid URL', () => {
    expect(extractDomain('https://console.example.com/path')).toBe('console.example.com');
  });

  it('returns input for invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('not-a-url');
  });
});

describe('isLoginPage', () => {
  it('detects /login path', () => {
    expect(isLoginPage('https://example.com/login')).toBe(true);
  });

  it('detects oauth in URL', () => {
    expect(isLoginPage('https://oauth-openshift.apps.example.com')).toBe(true);
  });

  it('detects inputUsername in URL', () => {
    expect(isLoginPage('https://example.com/inputUsername')).toBe(true);
  });

  it('returns false for non-login URLs', () => {
    expect(isLoginPage('https://console.example.com/dashboards')).toBe(false);
  });
});

describe('extractBaseDomain', () => {
  it('extracts base domain from OpenShift console URL', () => {
    const result = extractBaseDomain('https://console-openshift-console.apps.cluster1.example.com');
    expect(result).toBe('cluster1.example.com');
  });

  it('returns hostname for simple URLs', () => {
    const result = extractBaseDomain('https://example.com');
    expect(result).toBe('example.com');
  });

  it('returns input for invalid URLs', () => {
    expect(extractBaseDomain('not-a-url')).toBe('not-a-url');
  });
});

describe('getGroupColor', () => {
  it('returns an object with bg, text, and border', () => {
    const result = getGroupColor('test-group');
    expect(result).toHaveProperty('bg');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('border');
  });

  it('returns consistent color for the same input', () => {
    const a = getGroupColor('my-group');
    const b = getGroupColor('my-group');
    expect(a).toEqual(b);
  });

  it('may return different colors for different inputs', () => {
    const a = getGroupColor('group-alpha');
    const b = getGroupColor('group-zeta');
    // Not guaranteed to differ but the hash should distribute
    expect(a.bg).toBeDefined();
    expect(b.bg).toBeDefined();
  });
});

describe('getLoginTooltip', () => {
  it('returns tooltip HTML for hub role', () => {
    const result = getLoginTooltip({ key: 'hub' });
    expect(result).toContain('Active ACM Hub');
  });

  it('returns tooltip HTML for hub-passive role', () => {
    const result = getLoginTooltip({ key: 'hub-passive' });
    expect(result).toContain('Passive Hub');
  });

  it('returns tooltip HTML for primary role', () => {
    const result = getLoginTooltip({ key: 'primary' });
    expect(result).toContain('Primary Cluster');
  });

  it('returns tooltip HTML for secondary role', () => {
    const result = getLoginTooltip({ key: 'secondary' });
    expect(result).toContain('Secondary Cluster');
  });

  it('returns empty string for unknown role', () => {
    expect(getLoginTooltip({ key: 'unknown' })).toBe('');
  });

  it('returns empty string for unrecognized key', () => {
    expect(getLoginTooltip({ key: 'nonexistent' })).toBe('');
  });
});
