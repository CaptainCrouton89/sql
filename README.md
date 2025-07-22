# Supabase MCP Server

A Model Context Protocol (MCP) server that provides database and storage capabilities for Supabase.

## Features

- Execute SQL queries on Supabase databases
- Manage Supabase storage buckets and files
- Secure connection handling with SSL support
- Structured response format with row data, field information, and metadata
- Error handling and connection management

## Installation

### Prerequisites

- Node.js and npm/pnpm
- A Supabase project with connection string

### Environment Setup

Create a `.env.local` file in the project root:

```
SUPABASE_CONNECTION_STRING=your_supabase_connection_string_here
```

### Build and Install

Choose one of the following installation methods:

```bash
# Install to all supported applications (Claude Desktop, Cursor, Claude Code)
npm run install-server

# Or install to specific applications
npm run install-desktop  # Claude Desktop only
npm run install-cursor   # Cursor IDE only
npm run install-code     # Claude Code only
```

The installation script will:
1. Build the TypeScript code
2. Make the executable file executable
3. Update the appropriate MCP configuration files
4. Include environment variables from `.env.local`

## Usage

Once installed, you can use the various tools in your MCP-enabled application:

- **Tool name**: `execute-sql`
- **Description**: Execute SQL queries on Supabase database
- **Parameters**:
  - `query` (string): The SQL query to execute

### Example Queries

```sql
SELECT * FROM users LIMIT 10;
INSERT INTO posts (title, content) VALUES ('Hello', 'World');
UPDATE users SET last_login = NOW() WHERE id = 1;
```

## Response Format

The tool returns a JSON response with:
- `rowCount`: Number of affected/returned rows
- `rows`: Array of result rows
- `fields`: Array of field metadata (name, dataTypeID)
- `command`: SQL command type (SELECT, INSERT, etc.)

## Configuration

The server is configured in your MCP client's configuration file:
- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Cursor**: `~/.cursor/mcp.json`
- **Claude Code**: `~/.claude.json`

## Development

```bash
# Build the project
npm run build

# Start the server directly
npm start
```

## Security Notes

- The server uses SSL connections with `rejectUnauthorized: false` for Supabase compatibility
- Environment variables are loaded from `.env.local` and passed securely to the MCP configuration
- Connection strings should never be committed to version control