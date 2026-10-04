import { CalculationEngineError } from "../errors/index.js";
import type { Expression } from "./ast.js";

export const MAX_AST_DEPTH = 64;
export const MAX_AST_NODES = 1_000;
export const MAX_FUNCTION_ARGUMENTS = 32;

export function assertExpressionLimits(root: Expression): void {
  let nodes = 0;
  const stack: Array<{ node: Expression; depth: number }> = [
    { node: root, depth: 1 },
  ];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    nodes += 1;
    if (depth > MAX_AST_DEPTH || nodes > MAX_AST_NODES)
      throw new CalculationEngineError(
        "EXPRESSION_LIMIT_EXCEEDED",
        "Expression exceeds AST limits",
        { depth, nodes }
      );
    if (node.type === "call" && node.arguments.length > MAX_FUNCTION_ARGUMENTS)
      throw new CalculationEngineError(
        "EXPRESSION_LIMIT_EXCEEDED",
        "Function has too many arguments",
        { arguments: node.arguments.length }
      );
    const children =
      node.type === "unary"
        ? [node.operand]
        : node.type === "binary"
          ? [node.left, node.right]
          : node.type === "call"
            ? node.arguments
            : node.type === "if"
              ? [node.condition, node.then, node.else]
              : [];
    for (let index = children.length - 1; index >= 0; index--)
      stack.push({ node: children[index], depth: depth + 1 });
  }
}
