import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { z } from "zod";
import type { JSONOutputFormat } from "@anthropic-ai/sdk/resources";

function loadCodebase(dirPath: string): Map<string, string> {
  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
  const codebase = new Map<string, string>();
  for (const file of files) {
    codebase.set(file, fs.readFileSync(path.join(dirPath, file), "utf-8"));
  }
  console.log(`Loaded ${codebase.size} files for review`);
  return codebase;
}

async function singlePassReview(
  codebase: Map<string, string>,
  client: Anthropic,
  schema: JSONOutputFormat["schema"]
): Promise<string> {
  const allCode = Array.from(codebase.entries())
    .map(([name, content]) => `=== ${name} ===\n${content}`)
    .join("\n\n");

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Review all files for bugs, style issues, and security vulnerabilities. Provide specific line references for each issue. Don't be verbose.\n\n${allCode}`,
    },
  ];

  for (let iteration = 0; iteration < 30; iteration += 1) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages,
      output_config: {
        format: {
          type: "json_schema",
          schema,
        },
      },
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
    }

    messages.push({
      role: "user",
      content: "Continue the review from where you stopped.",
    });
  }

  throw new Error("An error occurred.");
}

async function multiPassReview(
  codebase: Map<string, string>,
  client: Anthropic,
  schema: JSONOutputFormat["schema"]
): Promise<string> {
  const reviews = codebase.entries().map((e) => {
    const m = new Map<string, string>();
    m.set(e[0], e[1]);
    return singlePassReview(m, client, schema);
  });

  return (await Promise.all(reviews)).join("\n\n");
}

const ReviewFinding = z.object({
  file: z.string(),
  line: z.number(),
  finding: z.string(),
});

type ReviewFinding = z.infer<typeof ReviewFinding>;
const schema = z.toJSONSchema(ReviewFinding, { target: "draft-7" });

const client = new Anthropic({
  baseURL: process.env["ANTHROPIC_BASE_URL"],
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

const codebase = loadCodebase("./src/loop/tools");
const results = await multiPassReview(codebase, client, schema);
console.log(results);
