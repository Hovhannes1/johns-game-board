import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'next-env.d.ts',
      'games/splendor/data/sources/raw/**',
    ],
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    // The rules engine must stay pure: no framework, network, or Node I/O (FR-15).
    files: ['games/splendor/engine/**/*.ts'],
    ignores: ['games/splendor/engine/**/*.test.ts', 'games/splendor/engine/testing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'next', 'next/*'],
              message: 'Engine must not depend on UI.',
            },
            {
              group: ['node:*', 'fs', 'path', 'crypto', 'http', 'net'],
              message: 'Engine must not do I/O.',
            },
            {
              group: ['socket.io', 'socket.io-client'],
              message: 'Engine must not touch the network.',
            },
            {
              group: ['@/server/*', '@/app/*', '@/components/*'],
              message: 'Engine is a leaf module.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
