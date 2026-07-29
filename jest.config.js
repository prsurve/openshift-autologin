module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['./tests/__mocks__/chrome.js', './tests/setup-dom.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'popup.js',
    'content.js',
    'background.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};
