const { parseJSON, parseYAML, parseEnv } = require('../../popup.js');

describe('parseJSON', () => {
  it('parses array of clusters', () => {
    const input = JSON.stringify([
      { name: 'c1', url: 'https://c1.example.com', user: 'admin', password: 'pass1' },
      { name: 'c2', url: 'https://c2.example.com', user: 'admin', password: 'pass2' },
    ]);
    const result = parseJSON(input);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('c1');
    expect(result[1].name).toBe('c2');
  });

  it('handles object with clusters key', () => {
    const input = JSON.stringify({
      clusters: [
        { name: 'c1', url: 'https://c1.example.com', user: 'admin', password: 'pass1' },
      ],
    });
    const result = parseJSON(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('c1');
  });

  it('maps alternative field names', () => {
    const input = JSON.stringify([
      { cluster_name: 'test', console_url: 'https://test.com/', username: 'admin', pass: 'p' },
    ]);
    const result = parseJSON(input);
    expect(result[0].name).toBe('test');
    expect(result[0].url).toBe('https://test.com');
    expect(result[0].user).toBe('admin');
    expect(result[0].password).toBe('p');
  });

  it('filters entries missing required fields', () => {
    const input = JSON.stringify([
      { name: 'c1', url: 'https://c1.com', user: 'admin' },
    ]);
    const result = parseJSON(input);
    expect(result).toHaveLength(0);
  });

  it('preserves kubeconfigUrl when present', () => {
    const input = JSON.stringify([
      { name: 'c1', url: 'https://c1.com', user: 'admin', password: 'p', kubeconfigUrl: 'https://cfg.com/kube' },
    ]);
    const result = parseJSON(input);
    expect(result[0].kubeconfigUrl).toBe('https://cfg.com/kube');
  });

  it('preserves role and group fields', () => {
    const input = JSON.stringify([
      { name: 'c1', url: 'https://c1.com', user: 'admin', password: 'p', role: 'hub', group: 'job-123' },
    ]);
    const result = parseJSON(input);
    expect(result[0].role).toBe('hub');
    expect(result[0].group).toBe('job-123');
  });

  it('defaults type to openshift', () => {
    const input = JSON.stringify([
      { name: 'c1', url: 'https://c1.com', user: 'admin', password: 'p' },
    ]);
    const result = parseJSON(input);
    expect(result[0].type).toBe('openshift');
  });
});

describe('parseYAML', () => {
  it('parses simple YAML cluster list', () => {
    const input = `
- name: cluster-1
  url: https://c1.example.com
  user: admin
  password: pass1
- name: cluster-2
  url: https://c2.example.com
  user: admin
  password: pass2
`;
    const result = parseYAML(input);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('cluster-1');
    expect(result[1].name).toBe('cluster-2');
  });

  it('handles clusters: key prefix', () => {
    const input = `
clusters:
  - name: c1
    url: https://c1.example.com
    user: admin
    password: p1
`;
    const result = parseYAML(input);
    expect(result).toHaveLength(1);
  });

  it('strips quotes from values', () => {
    const input = `
- name: 'my-cluster'
  url: "https://c1.example.com"
  user: 'admin'
  password: "secret"
`;
    const result = parseYAML(input);
    expect(result[0].name).toBe('my-cluster');
    expect(result[0].password).toBe('secret');
  });

  it('skips comments and blank lines', () => {
    const input = `
# This is a comment
- name: c1
  url: https://c1.example.com
  # inline comment
  user: admin
  password: pass
`;
    const result = parseYAML(input);
    expect(result).toHaveLength(1);
  });

  it('filters entries missing required fields', () => {
    const input = `
- name: incomplete
  url: https://c1.example.com
  user: admin
`;
    expect(() => parseYAML(input)).toThrow('No clusters found in YAML');
  });

  it('throws on empty input', () => {
    expect(() => parseYAML('')).toThrow('No clusters found in YAML');
  });

  it('accepts alternative field names', () => {
    const input = `
- name: c1
  url: https://c1.example.com
  username: admin
  pwd: secret
`;
    const result = parseYAML(input);
    expect(result[0].user).toBe('admin');
    expect(result[0].password).toBe('secret');
  });

  it('normalizes URLs by removing trailing slash', () => {
    const input = `
- name: c1
  url: https://c1.example.com/
  user: admin
  password: p
`;
    const result = parseYAML(input);
    expect(result[0].url).toBe('https://c1.example.com');
  });
});

describe('parseEnv', () => {
  it('parses env file with cluster prefixes', () => {
    const input = `
CLUSTER1_URL=https://c1.example.com
CLUSTER1_USER=admin
CLUSTER1_PASSWORD=secret
CLUSTER1_NAME=My Cluster
`;
    const result = parseEnv(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('My Cluster');
    expect(result[0].url).toBe('https://c1.example.com');
    expect(result[0].user).toBe('admin');
    expect(result[0].password).toBe('secret');
  });

  it('parses multiple clusters', () => {
    const input = `
C1_URL=https://c1.example.com
C1_USER=admin
C1_PASSWORD=p1
C2_URL=https://c2.example.com
C2_USER=admin
C2_PASSWORD=p2
`;
    const result = parseEnv(input);
    expect(result).toHaveLength(2);
  });

  it('generates name from prefix when NAME not provided', () => {
    const input = `
PROD_URL=https://prod.example.com
PROD_USER=admin
PROD_PASSWORD=secret
`;
    const result = parseEnv(input);
    expect(result[0].name).toBe('Prod');
  });

  it('skips comments and blank lines', () => {
    const input = `
# Database config
DB_HOST=localhost

# Cluster config
CLUSTER_URL=https://c1.example.com
CLUSTER_USER=admin
CLUSTER_PASSWORD=p
`;
    const result = parseEnv(input);
    expect(result).toHaveLength(1);
  });

  it('handles quoted values', () => {
    const input = `
C1_URL="https://c1.example.com"
C1_USER='admin'
C1_PASSWORD="my secret"
`;
    const result = parseEnv(input);
    expect(result[0].url).toBe('https://c1.example.com');
    expect(result[0].user).toBe('admin');
    expect(result[0].password).toBe('my secret');
  });

  it('throws when no valid clusters found', () => {
    const input = `
RANDOM_KEY=value
OTHER_KEY=value
`;
    expect(() => parseEnv(input)).toThrow('No valid cluster entries found');
  });

  it('throws on empty input', () => {
    expect(() => parseEnv('')).toThrow('No valid cluster entries found');
  });

  it('normalizes URLs', () => {
    const input = `
C1_URL=https://c1.example.com/
C1_USER=admin
C1_PASSWORD=p
`;
    const result = parseEnv(input);
    expect(result[0].url).toBe('https://c1.example.com');
  });
});
