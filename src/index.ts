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

// --- WORKFLOW AUTOMATION TOOLS ---

server.tool(
  "get_next_task",
  "Get the next actionable task based on dependencies and priority. Returns the task details and recommended agent.",
  {},
  async () => {
    const allTasks = await github.listIssues("open", ["task"]);
    
    // Filter to tasks that are not blocked or in-progress
    const availableTasks = allTasks.filter(task => 
      !task.labels.includes("status:in-progress") && 
      !task.labels.includes("status:blocked") &&
      !task.labels.includes("status:review")
    );

    if (availableTasks.length === 0) {
      return {
        content: [{ type: "text", text: "No actionable tasks available. All tasks are either in progress, blocked, or awaiting review." }],
      };
    }

    // Get the first available task (you can add priority logic here)
    const nextTask = availableTasks[0];
    
    // Determine recommended agent based on task status and type
    let recommendedAgent = "developer";
    if (!nextTask.labels.includes("status:designed")) {
      recommendedAgent = "architect";
    }

    const response = `**Next Task:** #${nextTask.number} - ${nextTask.title}\n**Status:** Ready to start\n**Recommended Agent:** ${recommendedAgent}\n**Description:** ${nextTask.body}`;
    
    return {
      content: [{ type: "text", text: response }],
    };
  }
);

server.tool(
  "start_task",
  "Mark a task as in-progress and assign it to the current agent role.",
  {
    taskId: z.number().describe("The task number to start"),
    agentRole: z.enum(["architect", "developer", "tech-lead", "qa", "devops"]).describe("The role starting this task"),
  },
  async ({ taskId, agentRole }) => {
    await github.updateIssue(taskId, { labels: ["task", "status:in-progress"] });
    await github.addComment(taskId, `Started by **${agentRole}** at ${new Date().toISOString()}`);
    
    return {
      content: [{ type: "text", text: `Task #${taskId} is now in progress. Assigned to: ${agentRole}` }],
    };
  }
);

server.tool(
  "request_review",
  "Request a review from another agent role. Changes task status to 'review'.",
  {
    taskId: z.number().describe("The task number to request review for"),
    reviewerRole: z.enum(["tech-lead", "qa", "architect", "devops"]).describe("The role to review this task"),
    notes: z.string().optional().describe("Additional notes for the reviewer"),
  },
  async ({ taskId, reviewerRole, notes }) => {
    await github.updateIssue(taskId, { labels: ["task", "status:review"] });
    const comment = `**Review Requested**\n\nReviewer: **${reviewerRole}**\n${notes ? `\nNotes: ${notes}` : ""}`;
    await github.addComment(taskId, comment);
    
    return {
      content: [{ type: "text", text: `Review requested from ${reviewerRole} for Task #${taskId}` }],
    };
  }
);

server.tool(
  "approve_task",
  "Approve a task after review. This closes the task and marks it as complete.",
  {
    taskId: z.number().describe("The task number to approve"),
    approverRole: z.enum(["tech-lead", "qa", "product-owner"]).describe("The role approving this task"),
    feedback: z.string().optional().describe("Optional approval feedback"),
  },
  async ({ taskId, approverRole, feedback }) => {
    await github.updateIssue(taskId, { state: "closed", labels: ["task", "status:approved"] });
    const comment = `✅ **Approved by ${approverRole}**\n${feedback ? `\nFeedback: ${feedback}` : ""}`;
    await github.addComment(taskId, comment);
    
    return {
      content: [{ type: "text", text: `Task #${taskId} approved and closed by ${approverRole}` }],
    };
  }
);

server.tool(
  "reject_task",
  "Reject a task and request changes. Moves task back to in-progress.",
  {
    taskId: z.number().describe("The task number to reject"),
    reviewerRole: z.enum(["tech-lead", "qa", "architect"]).describe("The role rejecting this task"),
    reason: z.string().describe("Reason for rejection and required changes"),
  },
  async ({ taskId, reviewerRole, reason }) => {
    await github.updateIssue(taskId, { labels: ["task", "status:in-progress", "needs-changes"] });
    const comment = `❌ **Changes Requested by ${reviewerRole}**\n\n${reason}`;
    await github.addComment(taskId, comment);
    
    return {
      content: [{ type: "text", text: `Task #${taskId} rejected. Changes requested by ${reviewerRole}` }],
    };
  }
);

server.tool(
  "block_task",
  "Mark a task as blocked due to external dependencies.",
  {
    taskId: z.number().describe("The task number to block"),
    reason: z.string().describe("Reason for blocking (e.g., 'Waiting for API key')"),
    blockedBy: z.string().optional().describe("What/who is blocking this task"),
  },
  async ({ taskId, reason, blockedBy }) => {
    await github.updateIssue(taskId, { labels: ["task", "status:blocked"] });
    const comment = `🚫 **Task Blocked**\n\nReason: ${reason}\n${blockedBy ? `Blocked by: ${blockedBy}` : ""}`;
    await github.addComment(taskId, comment);
    
    return {
      content: [{ type: "text", text: `Task #${taskId} marked as blocked` }],
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

server.prompt(
  "persona-tech-lead",
  "Act as Tech Lead. Focus on code review, team coordination, and unblocking developers.",
  {
    taskId: z.string().optional().describe("The Task ID to review"),
  },
  async ({ taskId }) => {
    let context = "";
    if (taskId) {
      const issue = await github.getIssue(parseInt(taskId));
      context = `Reviewing Task #${issue.number}: ${issue.title}\n\nDescription:\n${issue.body}`;
    }
    
    const tasksInReview = await github.listIssues("open", ["task", "status:review"]);
    const reviewList = tasksInReview.map(t => `- #${t.number}: ${t.title}`).join("\n");
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are the Tech Lead. Your responsibilities:
- Review code quality and design decisions
- Approve or reject tasks using 'approve_task' or 'reject_task'
- Unblock developers using 'block_task' when needed
- Coordinate between roles

Tasks awaiting your review:
${reviewList || "None"}

${context}`,
          },
        },
      ],
    };
  }
);

server.prompt(
  "persona-devops",
  "Act as DevOps Engineer. Focus on deployment, CI/CD, and infrastructure.",
  {},
  async () => {
    const approvedTasks = await github.listIssues("closed", ["task", "status:approved"]);
    const deploymentList = approvedTasks.slice(0, 5).map(t => `- #${t.number}: ${t.title}`).join("\n");
    
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are the DevOps Engineer. Your responsibilities:
- Deploy approved code to staging and production
- Set up CI/CD pipelines
- Monitor application health
- Manage infrastructure

Recently approved tasks ready for deployment:
${deploymentList || "None"}

Use 'add_comment' to log deployment status.`,
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
