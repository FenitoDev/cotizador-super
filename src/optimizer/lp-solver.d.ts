declare module 'javascript-lp-solver' {
  interface Model {
    optimize: string;
    opType: 'min' | 'max';
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    binaries?: Record<string, 1>;
    ints?: Record<string, 1>;
  }
  const solver: { Solve(model: Model): { feasible: boolean; result: number; [name: string]: number | boolean } };
  export default solver;
}
