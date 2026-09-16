import type Anthropic from "@anthropic-ai/sdk";
import { calculate, type CalculatorInput } from "./calculate.js";
import { magicBox, type MagicBoxInput } from "./magicBox.js";

export const tools: Anthropic.Tool[] = [
  {
    name: "calculator",
    description: "Evaluate a basic arithmetic expression.",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "An arithmetic expression, such as (12 + 8) * 3.",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "magic_box",
    description: "Opens the Magic Box, and returns the value inside.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
] as const;

export type ToolInput = CalculatorInput | MagicBoxInput;

export function runTool(
  name: Anthropic.Tool["name"],
  input: ToolInput
): string {
  switch (name) {
    case "calculator":
      return calculate(input as CalculatorInput);
    case "magic_box":
      return magicBox(input as MagicBoxInput);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
