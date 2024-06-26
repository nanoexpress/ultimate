import airlightNode from 'eslint-config-airlight-node';

export default [
  {
    ignores: ['typings', 'esm', 'cjs', 'tests', '.release-me']
  },
  ...airlightNode,
  {
    languageOptions: {
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigDirName: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/indent': 'off',
      'eslint-comments/disable-enable-pair': 'off',
      indent: 'off',
      'guard-for-in': 'off',
      'no-restricted-syntax': 'off',
      'no-continue': 'off',
      'no-param-reassign': 'off',
      'consistent-return': 'off',
      complexity: ['warn', 20],
      'max-depth': ['warn', 3],
      'max-lines': ['warn', 160],
      'max-lines-per-function': ['warn', 36]
    }
  }
];
