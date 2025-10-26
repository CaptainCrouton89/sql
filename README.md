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

Create a `.env.local` file in the project root with one of the following configurations:

#### Option 1: Management API Mode (Recommended - Bypasses Port 5432)

```bash
# Connection mode
DATABASE_MODE=management-api

# Required for management-api mode
SUPABASE_PROJECT_REF=your-project-ref
SUPABASE_ACCESS_TOKEN=your-access-token
SUPABASE_API_URL=https://api.supabase.com

# Required for storage tools
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

**How to get your access token:**
1. Go to [https://supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
2. Generate a new access token
3. Copy the token to `SUPABASE_ACCESS_TOKEN`

**Advantages:**
- Works over HTTPS (port 443)
- No firewall/VPN issues with port 5432
- Uses official Supabase Management API

#### Option 2: Direct PostgreSQL Mode (Requires Port 5432 Access)

```bash
# Connection mode (or omit this line - defaults to postgres)
DATABASE_MODE=postgres

# Required for postgres mode
SUPABASE_CONNECTION_STRING=your_supabase_connection_string_here

# Required for storage tools
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

**Limitations:**
- Requires port 5432 to be accessible
- May be blocked by corporate firewalls/VPNs

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