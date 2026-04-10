import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  // Map cross-project imports for tests
  moduleNameMapper: {
    '^../../../api/src/(.*)$': '<rootDir>/../api/src/$1',
  },
};

export default config;
