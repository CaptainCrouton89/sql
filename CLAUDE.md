# CLAUDE.md

This file provides guidance to Claude Code when working with the Supabase MCP Server.

## Project Overview

A Model Context Protocol (MCP) server providing database and storage capabilities for Supabase projects.

## Installation & Development

### Local Development
- `pnpm run install-mcp` - Build and install to .mcp.json
- **IMPORTANT**: After making changes, ask user to restart CLI to load new MCP tool changes

### Publishing
- `pnpm run release` - Build, commit, push, and publish to npm registry
- `pnpm run build` - Compile TypeScript only

### Environment Configuration

Create `.env.local` with required variables:

```bash
# Required: Your Supabase project reference ID
SUPABASE_PROJECT_REF=your-project-ref

# Required: Supabase access token (get from https://supabase.com/dashboard/account/tokens)
SUPABASE_ACCESS_TOKEN=your-access-token-here

# Required: Your Supabase service role key
SUPABASE_SERVICE_KEY=your-service-role-key

# Optional: Supabase API URL (defaults to https://api.supabase.com)
# SUPABASE_API_URL=https://api.supabase.com

# Optional: filter which tools are enabled (comma-separated)
# ENABLED_TOOLS=execute-sql,list-tables,describe-table
```

**Note**: `SUPABASE_URL` is automatically constructed from `SUPABASE_PROJECT_REF` as `https://{projectRef}.supabase.co`

## How It Works

- Uses Supabase Management API via `https://api.supabase.com/v1/projects/{ref}/database/query`
- Bypasses port 5432 completely (firewall-friendly)
- Works over HTTPS (port 443)
- No special setup required
- Requires access token from [Supabase Dashboard](https://supabase.com/dashboard/account/tokens)

## Available Tools

### Database Tools (src/tools/database.ts)
- `execute-sql` - Execute SQL queries with enhanced error guidance
- `describe-table` - Get table structure, constraints, RLS policies, triggers, indexes
- `describe-functions` - List database function signatures
- `list-tables` - List all tables with row counts
- `get-function-definition` - Get complete RPC function definition

### Storage Tools (src/tools/storage.ts)
- `upload-file`, `download-file`, `delete-file`
- `list-files`, `get-file-info`
- `create-bucket`, `delete-bucket`, `empty-bucket`, `list-buckets`
- `move-file`, `copy-file`
- `generate-signed-url`

## Testing Tools

When user asks to test a tool, use the corresponding MCP tool:
- `mcp__sql__execute-sql`
- `mcp__sql__describe-table`
- `mcp__sql__list-tables`
- etc.

If no change in output after code changes, remind user to restart CLI.

## Architecture

- **Server**: McpServer from `@modelcontextprotocol/sdk`
- **Transport**: StdioServerTransport
- **Validation**: Zod schemas
- **Database**: Supabase Management API via HTTPS
- **Storage**: Supabase Storage REST API

### Project Structure

```
src/
├── index.ts                # Main server with tool registration
├── tools/
│   ├── database.ts        # Database introspection and query tools
│   └── storage.ts         # Storage bucket and file operations
├── utils/
│   ├── database-client.ts # Management API database client
│   ├── management-api.ts  # HTTP-based SQL execution via Management API
│   └── response.ts        # Response formatting utilities
scripts/
├── update-config.js       # Multi-client configuration installer
├── build-and-publish.js   # Automated release
```

## Key Implementation Details

### Error Handling (src/tools/database.ts:56-158)
The `execute-sql` tool provides enhanced error guidance:
- Extracts table names from SQL errors
- Fetches and displays table structure on column errors
- Lists available tables on relation errors
- Suggests using `describe-table` and `list-tables` tools

### Management API Implementation (src/utils/management-api.ts)
Executes SQL via Supabase Management API:
1. Calls `https://api.supabase.com/v1/projects/{ref}/database/query` endpoint
2. Authenticates with access token
3. Returns JSON results formatted as database response

### Database Client (src/utils/database-client.ts)
Simple client wrapper for Management API:
- Provides consistent query interface
- Handles type conversions and error formatting
- Constructs from environment variables automatically

### Tool Filtering (src/index.ts)
Optional `ENABLED_TOOLS` env var to limit exposed tools:
```typescript
const isToolEnabled = (toolName: string) =>
  ENABLED_TOOLS.length === 0 || ENABLED_TOOLS.includes(toolName);
```

## Security Notes

- Service role key required for full admin access
- Access token required for Management API
- Never expose service role key or access token to client-side code
- Storage operations require proper bucket permissions

## Additional Resources

- `README.md` - Installation and usage documentation
