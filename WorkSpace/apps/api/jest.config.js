module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../../',
  roots: ['<rootDir>/apps/api/src', '<rootDir>/apps/api/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^@coinruler/(.*)$': '<rootDir>/packages/$1/src',
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/apps/api/tsconfig.jest.json',
      isolatedModules: true,
    },
  },
  collectCoverageFrom: ['apps/api/src/**/*.ts'],
  coverageThreshold: {
    global: { branches: 0, functions: 0, lines: 0, statements: 0 },
  },
};