const chrome = {
  storage: {
    local: {
      get: jest.fn((keys, callback) => { if (callback) callback({}); }),
      set: jest.fn((items, callback) => { if (callback) callback(); }),
      remove: jest.fn((keys, callback) => { if (callback) callback(); }),
    },
  },
  tabs: {
    create: jest.fn((options, callback) => { if (callback) callback({ id: 1 }); }),
    update: jest.fn(),
    query: jest.fn((query, callback) => { if (callback) callback([]); }),
    get: jest.fn(),
    onUpdated: { addListener: jest.fn(), removeListener: jest.fn() },
  },
  scripting: {
    executeScript: jest.fn(),
  },
  runtime: {
    id: 'test-extension-id',
    lastError: null,
    getManifest: jest.fn(() => ({ version: '3.3.0' })),
    sendMessage: jest.fn(),
    onMessage: { addListener: jest.fn() },
    onInstalled: { addListener: jest.fn() },
    getURL: jest.fn((path) => `chrome-extension://test-id/${path}`),
  },
  browsingData: {
    remove: jest.fn((options, dataTypes, callback) => { if (callback) callback(); }),
    removeCache: jest.fn(),
    removeCookies: jest.fn(),
  },
};

global.chrome = chrome;
module.exports = chrome;
