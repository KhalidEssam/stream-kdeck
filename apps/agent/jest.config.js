module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '@control-surface/shared': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testMatch: ['**/tests/**/*.test.ts', '**/src/**/*.spec.ts', '**/scripts/**/*.spec.ts'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },
};
