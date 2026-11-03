// Types derived from a router: a plain object of `(input, ctx) => result` functions, nested by namespace.
// Shared by the client (call signatures), the server (lookup) and generated code (staleness checks).

export type AnyProcedure = (...args: any[]) => unknown;
export type AnyRouter = { readonly [key: string]: AnyProcedure | AnyRouter };

/** `'user.get' | 'user.list' | ...` */
export type ProcedurePath<R, P extends string = ''> = {
  [K in keyof R & string]: R[K] extends AnyProcedure ? `${P}${K}` : ProcedurePath<R[K], `${P}${K}.`>;
}[keyof R & string];

export type ProcedureAt<R, P extends string> = P extends `${infer H}.${infer T}`
  ? H extends keyof R ? ProcedureAt<R[H], T> : never
  : P extends keyof R ? R[P] : never;

/** Input of a procedure without `undefined`; `never` when it takes none. */
export type InputOf<R, P extends string> = Exclude<Parameters<Extract<ProcedureAt<R, P>, AnyProcedure>>[0], undefined | void>;

export type InputOptional<R, P extends string> = undefined extends Parameters<Extract<ProcedureAt<R, P>, AnyProcedure>>[0] ? true : false;

export type OutputOf<R, P extends string> = Awaited<ReturnType<Extract<ProcedureAt<R, P>, AnyProcedure>>>;

/** Client arguments for a procedure's parameter list: the input only, `ctx` stays on the server. */
export type InputArgs<A extends unknown[]> = A extends []
  ? []
  : A extends [infer I, ...unknown[]]
    ? [I] extends [void] ? [] : undefined extends I ? [input?: I] : [input: I]
    : A extends [input?: infer I, ...rest: unknown[]]
      ? [input?: I]
      : [];

/** What a call returns: `'lazy'` views that read the response on access, or `'eager'` plain objects. */
export type DecodeMode = 'lazy' | 'eager';

export interface CallOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  /** Overrides the client's `decode` for this call. */
  decode?: DecodeMode;
}

export type ClientProcedure<F> = F extends (...args: infer A) => infer O
  ? (...args: [...InputArgs<A>, options?: CallOptions]) => Promise<Awaited<O>>
  : never;

export type Client<R> = {
  readonly [K in keyof R]: R[K] extends AnyProcedure ? ClientProcedure<R[K]> : Client<R[K]>;
};

// ------------------------------------------------------------------------------- staleness checks

/** Shows up in a type error when generated code no longer matches the router. */
export interface StaleCodegen_RunTbrGenerate<Where extends string> {
  readonly where: Where;
}

/** `true` when the generated and the source type accept the same values, else a readable error type. */
export type Same<Generated, Source, Where extends string> = [Generated] extends [Source]
  ? [Source] extends [Generated] ? true : StaleCodegen_RunTbrGenerate<Where>
  : StaleCodegen_RunTbrGenerate<Where>;

export type Expect<T extends true> = T;
