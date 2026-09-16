export type CalculatorInput = {
  expression: string;
};

export function calculate({ expression }: CalculatorInput): string {
  if (!/^[0-9+\-*/%().\s]+$/.test(expression)) {
    throw new Error("Expression contains unsupported characters");
  }

  const result = Function(`"use strict"; return (${expression})`)();
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("Expression did not produce a finite number");
  }

  return String(result);
}
