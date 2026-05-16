module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '@control-surface/shared': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testMatch: ['**/tests/**/*.test.ts'],
};
