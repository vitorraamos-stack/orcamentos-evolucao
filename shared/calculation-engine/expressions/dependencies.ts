import { configurableKeySchema } from "../contracts";
import { CalculationEngineError } from "../errors";
import type { Expression } from "./ast";
import { evaluateExpression } from "./evaluate";
import { assertExpressionLimits } from "./limits";
import type { ExpressionValue, SymbolDefinition, SymbolTable } from "./types";
import { typeFromValue } from "./types";
import { inferExpressionType } from "./validate";

export interface VariableDefinition {
  readonly key: string;
  readonly expression: Expression;
}

export function collectReferences(expression: Expression): string[] {
  assertExpressionLimits(expression);
  const references = new Set<string>();
  const stack = [expression];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "reference") references.add(node.key);
    else if (node.type === "unary") stack.push(node.operand);
    else if (node.type === "binary") stack.push(node.right, node.left);
    else if (node.type === "call")
      for (let index = node.arguments.length - 1; index >= 0; index--)
        stack.push(node.arguments[index]);
    else if (node.type === "if")
      stack.push(node.else, node.then, node.condition);
  }
  return Array.from(references).sort();
}

export function topologicallySortVariables(
  inputKeys: readonly string[],
  variables: readonly VariableDefinition[],
  contextKeys: readonly string[] = []
): VariableDefinition[] {
  for (const key of [...inputKeys, ...contextKeys])
    if (!configurableKeySchema.safeParse(key).success)
      throw new CalculationEngineError(
        "INVALID_EXPRESSION",
        `Invalid external symbol key: ${key}`
      );
  const byKey = new Map<string, VariableDefinition>();
  for (const variable of variables) {
    if (!configurableKeySchema.safeParse(variable.key).success)
      throw new CalculationEngineError(
        "INVALID_EXPRESSION",
        `Invalid variable key: ${variable.key}`
      );
    if (byKey.has(variable.key))
      throw new CalculationEngineError(
        "DUPLICATE_VARIABLE_KEY",
        `Duplicate variable key: ${variable.key}`,
        { key: variable.key }
      );
    byKey.set(variable.key, variable);
  }
  const knownExternal = new Set([...inputKeys, ...contextKeys]);
  const dependencies = new Map<string, string[]>();
  for (const variable of variables) {
    const refs = collectReferences(variable.expression);
    for (const ref of refs)
      if (!byKey.has(ref) && !knownExternal.has(ref))
        throw new CalculationEngineError(
          "UNKNOWN_REFERENCE",
          `Unknown reference: ${ref}`,
          { variable: variable.key, reference: ref }
        );
    dependencies.set(variable.key, refs.filter(ref => byKey.has(ref)).sort());
  }
  const state = new Map<string, 0 | 1 | 2>(),
    result: VariableDefinition[] = [],
    path: string[] = [];
  const visit = (key: string): void => {
    if (state.get(key) === 2) return;
    if (state.get(key) === 1) {
      const start = path.indexOf(key);
      const cycle = [...path.slice(start), key];
      throw new CalculationEngineError(
        "CYCLIC_DEPENDENCY",
        `Cyclic dependency: ${cycle.join(" → ")}`,
        { cycle }
      );
    }
    state.set(key, 1);
    path.push(key);
    for (const dependency of dependencies.get(key) ?? []) visit(dependency);
    path.pop();
    state.set(key, 2);
    result.push(byKey.get(key)!);
  };
  for (const key of Array.from(byKey.keys()).sort()) visit(key);
  return result;
}

export interface EvaluateVariablesOptions {
  readonly inputs: Readonly<Record<string, ExpressionValue>>;
  readonly variables: readonly VariableDefinition[];
  readonly context?: Readonly<Record<string, ExpressionValue>>;
}

export function evaluateVariables(
  options: EvaluateVariablesOptions
): Readonly<Record<string, ExpressionValue>> {
  const contextValues = options.context ?? {};
  const order = topologicallySortVariables(
    Object.keys(options.inputs),
    options.variables,
    Object.keys(contextValues)
  );
  const values: Record<string, ExpressionValue> = Object.assign(
    Object.create(null),
    contextValues,
    options.inputs
  );
  const symbols: Record<string, SymbolDefinition> = Object.create(
    null
  ) as Record<string, SymbolDefinition>;
  for (const [key, value] of Object.entries(contextValues))
    symbols[key] = { key, source: "CONTEXT", type: typeFromValue(value) };
  for (const [key, value] of Object.entries(options.inputs))
    symbols[key] = { key, source: "INPUT", type: typeFromValue(value) };
  const results: Record<string, ExpressionValue> = {};
  for (const variable of order) {
    const type = inferExpressionType(
      variable.expression,
      symbols as SymbolTable
    );
    symbols[variable.key] = { key: variable.key, source: "VARIABLE", type };
    const value = evaluateExpression(variable.expression, { values });
    values[variable.key] = value;
    results[variable.key] = value;
  }
  return results;
}
