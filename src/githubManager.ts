import { Octokit } from "@octokit/rest";

export class GitHubManager {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(owner: string, repo: string) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN environment variable is not set");
    }
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  async createIssue(title: string, body: string, labels: string[] = []) {
    const response = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels,
    });
    return response.data;
  }

  async listIssues(state: "open" | "closed" | "all" = "open", labels?: string[]) {
    const response = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state,
      labels: labels ? labels.join(",") : undefined,
    });
    return response.data.map(issue => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: issue.labels.map((l: any) => l.name),
      body: issue.body,
    }));
  }

  async addComment(issueNumber: number, body: string) {
    const response = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
    return response.data;
  }

  async updateIssue(issueNumber: number, updates: { state?: "open" | "closed", labels?: string[] }) {
    const response = await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      ...updates,
    });
    return response.data;
  }

  async getIssue(issueNumber: number) {
    const response = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return {
      number: response.data.number,
      title: response.data.title,
      body: response.data.body,
      state: response.data.state,
      labels: response.data.labels.map((l: any) => l.name),
      comments: response.data.comments,
    };
  }
}
