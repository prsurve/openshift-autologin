const { groupClusters } = require('../../popup.js');

describe('groupClusters', () => {
  it('groups clusters by group field', () => {
    const clusters = [
      { name: 'c1', group: 'job-1' },
      { name: 'c2', group: 'job-1' },
      { name: 'c3', group: 'job-2' },
    ];
    const result = groupClusters(clusters);
    const grouped = result.filter(g => g.groupId !== null);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].clusters).toHaveLength(2);
    expect(grouped[1].clusters).toHaveLength(1);
  });

  it('puts ungrouped clusters as singletons', () => {
    const clusters = [
      { name: 'c1' },
      { name: 'c2' },
    ];
    const result = groupClusters(clusters);
    expect(result).toHaveLength(2);
    result.forEach(g => {
      expect(g.groupId).toBeNull();
      expect(g.clusters).toHaveLength(1);
    });
  });

  it('handles mixed grouped and ungrouped', () => {
    const clusters = [
      { name: 'c1', group: 'job-1' },
      { name: 'c2' },
      { name: 'c3', group: 'job-1' },
    ];
    const result = groupClusters(clusters);
    const grouped = result.filter(g => g.groupId !== null);
    const ungrouped = result.filter(g => g.groupId === null);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].clusters).toHaveLength(2);
    expect(ungrouped).toHaveLength(1);
  });

  it('treats empty group string as ungrouped', () => {
    const clusters = [
      { name: 'c1', group: '' },
      { name: 'c2', group: '  ' },
    ];
    const result = groupClusters(clusters);
    result.forEach(g => {
      expect(g.groupId).toBeNull();
    });
  });

  it('preserves original indices', () => {
    const clusters = [
      { name: 'c0' },
      { name: 'c1', group: 'g1' },
      { name: 'c2', group: 'g1' },
    ];
    const result = groupClusters(clusters);
    const grouped = result.find(g => g.groupId === 'g1');
    expect(grouped.clusters[0].index).toBe(1);
    expect(grouped.clusters[1].index).toBe(2);
  });

  it('puts named groups before ungrouped singletons', () => {
    const clusters = [
      { name: 'standalone' },
      { name: 'c1', group: 'job-1' },
    ];
    const result = groupClusters(clusters);
    expect(result[0].groupId).toBe('job-1');
    expect(result[1].groupId).toBeNull();
  });

  it('handles empty array', () => {
    const result = groupClusters([]);
    expect(result).toHaveLength(0);
  });
});
