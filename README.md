# TypeScript MCP Server

This is a Model Context Protocol (MCP) server implemented in TypeScript.

## Features

- Basic arithmetic tools (calculate-sum)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the project:
   ```bash
   npm run build
   ```

## Usage

This server can be used with any MCP client.

### VS Code

This project includes a `.vscode/mcp.json` configuration file. You can use the "MCP: Add Server" command in VS Code to register this server.

### Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp2": {
      "command": "node",
      "args": ["/path/to/mcp2/build/index.js"]
    }
  }
}
```
