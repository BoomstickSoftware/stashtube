import type { CodegenConfig } from '@graphql-codegen/cli'

// src/stash.schema.ts from stash.schema.graphql (refresh that with scripts/stash-schema.mjs).
const config: CodegenConfig = {
  schema: 'stash.schema.graphql',
  generates: {
    'src/stash.schema.ts': {
      plugins: ['typescript'],
      config: {
        enumsAsTypes: true,
        skipTypename: true,
        // Stash's objects are read whole; inputs keep their optionals as `?:`.
        avoidOptionals: { field: true, inputValue: false, object: false, defaultValue: false },
        scalars: { Int: 'number', Float: 'number', ID: 'string', Time: 'string', Timestamp: 'string', Int64: 'number', Any: 'unknown', Upload: 'unknown', Map: 'Record<string, unknown>', BoolMap: 'Record<string, boolean>', PluginConfigMap: 'Record<string, unknown>', UIConfig: 'Record<string, unknown>' },
      },
    },
  },
}

export default config
