const { matchVSphereCluster } = require('../../content.js');

describe('matchVSphereCluster', () => {
  const clusters = [
    { name: 'vcenter-prod', url: 'https://vcenter.prod.example.com/ui/', type: 'vsphere' },
    { name: 'vcenter-dev', url: 'https://vcenter.dev.example.com/ui/', type: 'vsphere' },
    { name: 'esxi-host1', url: 'https://esxi1.example.com', type: 'vsphere' },
  ];

  it('returns exact hostname match', () => {
    const result = matchVSphereCluster(clusters, 'vcenter.prod.example.com', 'https://vcenter.prod.example.com/ui/');
    expect(result.name).toBe('vcenter-prod');
  });

  it('returns null when no match found', () => {
    const result = matchVSphereCluster(clusters, 'unknown.example.com', 'https://unknown.example.com/');
    expect(result).toBeNull();
  });

  it('handles URL prefix match', () => {
    const result = matchVSphereCluster(clusters, 'vcenter.dev.example.com', 'https://vcenter.dev.example.com/ui/login');
    expect(result.name).toBe('vcenter-dev');
  });

  it('returns null for empty clusters array', () => {
    const result = matchVSphereCluster([], 'vcenter.prod.example.com', 'https://vcenter.prod.example.com/');
    expect(result).toBeNull();
  });

  it('handles invalid cluster URLs gracefully', () => {
    const badClusters = [
      { name: 'bad', url: 'not-a-url', type: 'vsphere' },
    ];
    const result = matchVSphereCluster(badClusters, 'example.com', 'https://example.com/');
    expect(result).toBeNull();
  });

  it('prefers exact hostname over partial match', () => {
    const overlapping = [
      { name: 'partial', url: 'https://example.com', type: 'vsphere' },
      { name: 'exact', url: 'https://vc.example.com', type: 'vsphere' },
    ];
    const result = matchVSphereCluster(overlapping, 'vc.example.com', 'https://vc.example.com/ui/');
    expect(result.name).toBe('exact');
  });
});
