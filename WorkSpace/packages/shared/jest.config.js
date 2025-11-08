module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../../',
  roots: ['<rootDir>/packages/shared/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^@coinruler/(.*)$': '<rootDir>/packages/$1/src',
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/packages/shared/tsconfig.jest.json',
      isolatedModules: true,
    },
  },
  collectCoverageFrom: ['packages/shared/src/**/*.ts', '!packages/shared/src/__tests__/**'],
  coverageThreshold: {
    global: { branches: 0, functions: 0, lines: 0, statements: 0 },
  },
};