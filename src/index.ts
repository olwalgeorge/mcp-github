import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GitHubManager } from "./githubManager.js";

// Initialize GitHub Manager
// Ensure these are set in your .env file
const OWNER = process.env.GITHUB_OWNER || "your-username";
const REPO = process.env.GITHUB_REPO || "your-repo";
const github = new GitHubManager(OWNER, REPO);

// Create server instance
const server = new McpServer({
  name: "orchestration-server",
  version: "1.0.0",
});

// --- TOOLS ---

server.tool(
  "create_epic",
  "Create a high-level business requirement (Epic). Use this as the Domain Expert.",
  {
    title: z.string().describe("The title of the epic (e.g., 'User Authentication System')"),
    description: z.string().describe("Detailed business requirements and acceptance criteria"),
  },
  async ({ title, description }) => {
    const issue = await github.createIssue(title, description, ["epic"]);
    return {
      content: [{ type: "text", text: `Created Epic #${issue.number}: ${issue.title}` }],
    };
  }
);

server.tool(
  "create_technical_task",
  "Create a technical task derived from an Epic. Use this as the Architect.",
  {
    title: z.string().describe("The title of the task (e.g., 'Setup JWT Middleware')"),
    description: z.string().describe("Technical implementation details"),
    parentEpicId: z.number().optional().describe("The issue number of the parent Epic"),
  },
  async ({ title, description, parentEpicId }) => {
    let body = description;
    if (parentEpicId) {
      body += `\n\nRelates to Epic #${parentEpicId}`;
    }
    const issue = await github.createIssue(title, body, ["task"]);
    return {
      content: [{ type: "text", text: `Created Task #${issue.number}: ${issue.title}` }],
    };
  }
);

server.tool(
  "report_bug",
  "Log a bug found during testing. Use this as QA.",
  {
    title: z.string().describe("Summary of the bug"),
    stepsToReproduce: z.string().describe("Steps to reproduce the issue"),
    severity: z.enum(["low", "medium", "high", "critical"]).describe("Severity of the bug"),
  },
  async ({ title, stepsToReproduce, severity }) => {
    const body = `**Severity:** ${severity}\n\n**Steps to Reproduce:**\n${stepsToReproduce}`;
    const issue = await github.createIssue(title, body, ["bug", `severity-${severity}`]);
    return {
      content: [{ type: "text", text: `Logged Bug #${issue.number}: ${issue.title}` }],
    };
  }
);

server.tool(
  "get_project_status",
  "Get a list of open items to understand the current state.",
  {
    type: z.enum(["epic", "task", "bug", "all"]).default("all").describe("Filter by issue type"),
  },
  async ({ type }) => {
    const labels = type === "all" ? undefined : [type];
    const issues = await github.listIssues("open", labels);
    const summary = issues.map(i => `#${i.number} [${i.labels.join(", ")}] ${i.title}`).join("\n");
    return {
      content: [{ type: "text", text: summary || "No open items found." }],
    };
  }
);

server.tool(
  "add_comment",
  "Add a comment to an issue. Use this for handoffs or reviews.",
  {
    issueNumber: z.number().describe("The issue number to comment on"),
    comment: z.string().describe("The comment text"),
  },
  async ({ issueNumber, comment }) => {
    await github.addComment(issueNumber, comment);
    return {
      content: [{ type: "text", text: `Added comment to #${issueNumber}` }],
    };
  }
);

server.tool(
  "close_issue",
  "Close an issue when it is completed.",
  {
    issueNumber: z.number().describe("The issue number to close"),
  },
  async ({ issueNumber }) => {
    await github.updateIssue(issueNumber, { state: "closed" });
    return {
      content: [{ type: "text", text: `Closed issue #${issueNumber}` }],
    };
  }
);

// --- PROMPTS (PERSONAS) ---

server.prompt(
  "persona-domain-expert",
  "Act as the Domain Expert. Focus on business requirements and user value.",
  {
    context: z.string().optional().describe("Additional context"),
  },
  async ({ context }) => {
    const epics = await github.listIssues("open", ["epic"]);
    const epicList = epics.map(e => `- #${e.number}: ${e.title}`).join("\n");
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are the Domain Expert. Your goal is to define the product vision through Epics.\n\nCurrent Epics:\n${epicList}\n\n${context || ""}`,
          },
        },
      ],
    };
  }
);

server.prompt(
  "persona-architect",
  "Act as the Architect. Focus on system design and technical feasibility.",
  {
    epicId: z.string().optional().describe("The Epic ID to focus on"),
  },
  async ({ epicId }) => {
    let context = "";
    if (epicId) {
      const issue = await github.getIssue(parseInt(epicId));
      context = `Focusing on Epic #${issue.number}: ${issue.title}\n${issue.body}`;
    }
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are the Software Architect. Your goal is to design the system and break Epics into Technical Tasks.\n\n${context}`,
          },
        },
      ],
    };
  }
);

server.prompt(
  "persona-developer",
  "Act as the Developer. Focus on writing clean, working code.",
  {
    taskId: z.string().describe("The Task ID to work on"),
  },
  async ({ taskId }) => {
    const issue = await github.getIssue(parseInt(taskId));
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are the Lead Developer. You are working on Task #${issue.number}: ${issue.title}.\n\nDescription:\n${issue.body}\n\nPlease implement this task.`,
          },
        },
      ],
    };
  }
);

server.prompt(
  "persona-qa",
  "Act as QA. Focus on finding edge cases and bugs.",
  {},
  async () => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are the QA Engineer. Your goal is to test the application and log bugs using the 'report_bug' tool.`,
          },
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
