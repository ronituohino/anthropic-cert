import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { tools, runTool, type ToolInput } from "./tools/index.js";

export async function agent(prompt: string): Promise<string> {
  const client = new Anthropic({
    baseURL: process.env["ANTHROPIC_BASE_URL"],
    apiKey: process.env["ANTHROPIC_API_KEY"],
  });
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  for (let iteration = 0; iteration < 20; iteration += 1) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") {
        continue;
      }

      try {
        const result = runTool(block.name, block.input as ToolInput);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      } catch (error) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: error instanceof Error ? error.message : "Tool failed",
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("Claude exceeded the maximum number of tool-use iterations");
}

console.log(await agent("What is (12 + <the value inside the Magic Box>) * 3"));
