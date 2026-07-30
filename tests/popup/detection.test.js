const {
  detectRole, getLoginUrl, isCertificateErrorPage, isOpenShiftClusterURL,
} = require('../../popup.js');

describe('detectRole', () => {
  describe('OpenShift clusters', () => {
    it('returns explicit role when set', () => {
      const cluster = { name: 'test', url: 'https://example.com', role: 'hub' };
      expect(detectRole(cluster).key).toBe('hub');
    });

    it('detects hub from name', () => {
      const cluster = { name: 'acm-hub', url: 'https://example.com' };
      expect(detectRole(cluster).key).toBe('hub');
    });

    it('detects hub-passive from name', () => {
      const cluster = { name: 'hub-1', url: 'https://example.com' };
      expect(detectRole(cluster).key).toBe('hub-passive');
    });

    it('detects hub-passive with passive keyword', () => {
      const cluster = { name: 'passive-hub', url: 'https://example.com' };
      expect(detectRole(cluster).key).toBe('hub-passive');
    });

    it('detects primary cluster (c1)', () => {
      const cluster = { name: 'odf-c1', url: 'https://example.com' };
      expect(detectRole(cluster).key).toBe('primary');
    });

    it('detects secondary cluster (c2)', () => {
      const cluster = { name: 'odf-c2', url: 'https://example.com' };
      expect(detectRole(cluster).key).toBe('secondary');
    });

    it('detects spoke cluster as primary', () => {
      const cluster = { name: 'managed-spoke', url: 'https://example.com' };
      expect(detectRole(cluster).key).toBe('primary');
    });

    it('returns unknown for unrecognized names', () => {
      const cluster = { name: 'random-server', url: 'https://example.com' };
      expect(detectRole(cluster).key).toBe('unknown');
    });
  });

  describe('vSphere clusters', () => {
    it('returns explicit role when set', () => {
      const cluster = { name: 'vc1', url: 'https://vc.example.com', type: 'vsphere', role: 'vcenter' };
      expect(detectRole(cluster).key).toBe('vcenter');
    });

    it('detects vcenter from name', () => {
      const cluster = { name: 'vcenter-prod', url: 'https://vc.example.com', type: 'vsphere' };
      expect(detectRole(cluster).key).toBe('vcenter');
    });

    it('detects esxi from name', () => {
      const cluster = { name: 'esxi-host-1', url: 'https://esxi.example.com', type: 'vsphere' };
      expect(detectRole(cluster).key).toBe('esxi');
    });

    it('returns unknown for unrecognized vSphere names', () => {
      const cluster = { name: 'my-server', url: 'https://server.example.com', type: 'vsphere' };
      expect(detectRole(cluster).key).toBe('unknown');
    });
  });
});

describe('getLoginUrl', () => {
  it('returns OpenShift URL as-is', () => {
    const cluster = { url: 'https://console.apps.example.com', type: 'openshift' };
    expect(getLoginUrl(cluster)).toBe('https://console.apps.example.com');
  });

  it('adds /ui/ path for vSphere root URL', () => {
    const cluster = { url: 'https://vcenter.example.com', type: 'vsphere' };
    expect(getLoginUrl(cluster)).toBe('https://vcenter.example.com/ui/');
  });

  it('adds trailing slash for vSphere /ui path', () => {
    const cluster = { url: 'https://vcenter.example.com/ui', type: 'vsphere' };
    expect(getLoginUrl(cluster)).toBe('https://vcenter.example.com/ui/');
  });

  it('returns vSphere URL unchanged if already has /ui/', () => {
    const cluster = { url: 'https://vcenter.example.com/ui/', type: 'vsphere' };
    expect(getLoginUrl(cluster)).toBe('https://vcenter.example.com/ui/');
  });

  it('defaults to openshift type when type is missing', () => {
    const cluster = { url: 'https://console.apps.example.com' };
    expect(getLoginUrl(cluster)).toBe('https://console.apps.example.com');
  });

  it('returns invalid vSphere URL as-is', () => {
    const cluster = { url: 'not-a-url', type: 'vsphere' };
    expect(getLoginUrl(cluster)).toBe('not-a-url');
  });
});

describe('isCertificateErrorPage', () => {
  it('detects chrome-error:// URL', () => {
    expect(isCertificateErrorPage('chrome-error://chromewebdata/', '')).toBe(true);
  });

  it('detects about:neterror URL', () => {
    expect(isCertificateErrorPage('about:neterror', '')).toBe(true);
  });

  it('returns false for normal HTTPS URLs', () => {
    expect(isCertificateErrorPage('https://example.com', '')).toBe(false);
  });

  it('returns false for HTTP URLs', () => {
    expect(isCertificateErrorPage('http://example.com', '')).toBe(false);
  });

  it('detects error from title on non-http URLs', () => {
    expect(isCertificateErrorPage('data:text/html', 'Privacy Error')).toBe(true);
  });

  it('ignores error titles on HTTPS URLs', () => {
    expect(isCertificateErrorPage('https://example.com', 'Privacy Error')).toBe(false);
  });
});

describe('isOpenShiftClusterURL', () => {
  it('accepts standard OpenShift console URL', () => {
    expect(isOpenShiftClusterURL(
      'https://console-openshift-console.apps.cluster1.example.com'
    )).toBe(true);
  });

  it('accepts OAuth URL', () => {
    expect(isOpenShiftClusterURL(
      'https://oauth-openshift.apps.cluster1.example.com'
    )).toBe(true);
  });

  it('accepts API URL with port 6443', () => {
    expect(isOpenShiftClusterURL(
      'https://api.cluster1.example.com:6443'
    )).toBe(true);
  });

  it('accepts openshiftapps.com URL', () => {
    expect(isOpenShiftClusterURL(
      'https://console.apps.myapp.openshiftapps.com'
    )).toBe(true);
  });

  it('rejects GitHub URLs', () => {
    expect(isOpenShiftClusterURL('https://github.com/user/repo')).toBe(false);
  });

  it('rejects Jenkins URLs', () => {
    expect(isOpenShiftClusterURL('https://jenkins.example.com/job/build')).toBe(false);
  });

  it('rejects GitLab URLs', () => {
    expect(isOpenShiftClusterURL('https://gitlab.example.com/project')).toBe(false);
  });

  it('rejects Quay URLs', () => {
    expect(isOpenShiftClusterURL('https://quay.io/repository/test')).toBe(false);
  });

  it('returns false for null input', () => {
    expect(isOpenShiftClusterURL(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isOpenShiftClusterURL('')).toBe(false);
  });

  it('returns false for non-HTTP URL', () => {
    expect(isOpenShiftClusterURL('ftp://example.com')).toBe(false);
  });
});
