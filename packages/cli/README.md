# @tbr/cli

Sources and tests of the `tbr` command. Not published on its own: the `ts-bin-rpc` build compiles
`src/` into its `dist/cli`, and the published `ts-bin-rpc` package provides the `tbr` binary.
Inside this repository, workspace packages depend on `@tbr/cli` to run `tbr` from source.

Before 0.1.0-alpha.1 the command was published as `ts-bin-rpc-cli`; that package is deprecated.
