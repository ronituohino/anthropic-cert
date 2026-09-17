import "dotenv/config";
import { query, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const baseUrl = process.env["ANTHROPIC_BASE_URL"];
const authKey = process.env["ANTHROPIC_API_KEY"];

if (!baseUrl || !authKey) {
  throw new Error("BASE_URL and API_KEY must be configured");
}

const env = {
  ...process.env,
  ANTHROPIC_BASE_URL: baseUrl,
  ANTHROPIC_API_KEY: authKey,
  ANTHROPIC_AUTH_TOKEN: undefined,
};

const webSearchAgent: AgentDefinition = {
  description:
    "Searches the web for current information and returns results with source URLs and titles",
  prompt: [
    "Search for information on the given topic.",
    "Return each finding as JSON with fields: claim, source_url, source_title, retrieved_date.",
  ].join(" "),
  tools: ["WebSearch"],
  maxTurns: 8,
};

const docAnalysisAgent: AgentDefinition = {
  description:
    "Analyses supplied documents and returns findings with page references",
  prompt: [
    "Analyse the provided documents.",
    "Return each finding as JSON with fields: claim, document_name, page_number, section.",
  ].join(" "),
  tools: ["Read", "Grep"],
  maxTurns: 8,
};

const Finding = z.object({
  claim: z.string(),
  source_url: z.string(),
  document_name: z.string(),
  page_number: z.number().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  retrieved_by: z.string(),
});

const ResearchOutput = z.object({
  findings: z.array(Finding),
  query: z.string(),
  timestamp: z.string(),
});

const AgentOutput = z.object({
  web_search_output: ResearchOutput,
  doc_analysis_output: ResearchOutput,
});

type AgentOutput = z.infer<typeof AgentOutput>;
const schema = z.toJSONSchema(AgentOutput, { target: "draft-7" });

let output: AgentOutput | undefined = undefined;
const prompt = "renewable energy sources";

try {
  for await (const message of query({
    prompt: `Research the topic of ${prompt}. Invoke the web-search and doc-analysis subagents in parallel — emit both Agent tool calls in a single response — then return their complete structured findings.`,
    options: {
      model: "claude-sonnet-5",
      effort: "medium",
      allowedTools: ["Agent"],
      agents: {
        "web-search": webSearchAgent,
        "doc-analysis": docAnalysisAgent,
      },
      outputFormat: {
        type: "json_schema",
        schema: schema,
      },
      maxTurns: 10,
      env,
    },
  })) {
    if (
      message.type === "result" &&
      message.subtype === "success" &&
      message.structured_output
    ) {
      // Validate and get fully typed result
      const parsed = AgentOutput.safeParse(message.structured_output);
      if (parsed.success) {
        output = parsed.data;
      } else {
        console.error(`Error parsing output: ${parsed}`);
      }
    } else {
      console.log(message);
    }
  }
} catch (error) {
  console.error(`Session ended with an error: ${error}`);
}

if (output) {
  const synthesisPrompt = `Synthesise the following research findings into a coherent report. Every claim MUST include a citation with source URL and page number.

Web search findings:
${JSON.stringify(output?.web_search_output.findings, null, 2)}

Document analysis findings:
${JSON.stringify(output?.doc_analysis_output.findings, null, 2)}

Output a report where every factual claim links to its source.`;

  console.log(synthesisPrompt);

  try {
    for await (const message of query({
      prompt: synthesisPrompt,
      options: {
        model: "claude-sonnet-5",
        effort: "medium",
        maxTurns: 10,
        env,
      },
    })) {
      if (message.type === "result" && message.subtype === "success") {
        console.log(message.result);
      }
    }
  } catch (error) {
    console.error(`Session ended with an error: ${error}`);
  }
}
