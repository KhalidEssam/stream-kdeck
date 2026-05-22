const path = require('path');

module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', '**/tests/**/*.test.ts', '**/tests/**/*.test.tsx', '**/src/**/*.test.ts', '**/src/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['babel-jest', {
      configFile: path.resolve(__dirname, 'babel.config.js'),
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jest-websocket-mock|mock-socket|expo)/)',
  ],
};
