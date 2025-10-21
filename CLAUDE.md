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
# Required for both modes
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Connection mode (defaults to 'http' - firewall-friendly)
CONNECTION_MODE=http

# Optional: filter which tools are enabled (comma-separated)
# ENABLED_TOOLS=execute-sql,list-tables,describe-table

# Only required if using CONNECTION_MODE=postgres
# SUPABASE_CONNECTION_STRING=postgresql://...
```

## Connection Modes

### HTTP Mode (Default, Recommended)
- Uses Supabase REST API via `/rest/v1/rpc/execute_sql`
- Bypasses port 5432 (firewall-friendly)
- Requires one-time SQL function installation (see `HTTP_MODE_SETUP.md`)
- Set `CONNECTION_MODE=http`

### Postgres Mode (Direct Connection)
- Direct PostgreSQL connection on port 5432
- May be blocked by firewalls/VPNs
- Set `CONNECTION_MODE=postgres` and provide `SUPABASE_CONNECTION_STRING`

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
- **Database**: Direct postgres (pg) or HTTP (axios)
- **Storage**: Supabase Storage REST API

### Project Structure

```
src/
├── index.ts                # Main server with tool registration
├── tools/
│   ├── database.ts        # Database introspection and query tools
│   └── storage.ts         # Storage bucket and file operations
├── utils/
│   ├── database.ts        # Connection pooling and client management
│   ├── http-database.ts   # HTTP-based SQL execution
│   └── response.ts        # Response formatting utilities
migrations/
├── 001_execute_sql_function.sql  # Required for HTTP mode
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

### HTTP Mode (src/utils/http-database.ts)
Executes SQL via Supabase RPC function:
1. Calls `/rest/v1/rpc/execute_sql` endpoint
2. Passes query to server-side function
3. Returns JSON results formatted as database response

### Tool Filtering (src/index.ts:49-50)
Optional `ENABLED_TOOLS` env var to limit exposed tools:
```typescript
const isToolEnabled = (toolName: string) =>
  ENABLED_TOOLS.length === 0 || ENABLED_TOOLS.includes(toolName);
```

## Security Notes

- Service role key required for full admin access
- HTTP mode's `execute_sql` function marked `SECURITY DEFINER`
- Never expose service role key to client-side code
- Storage operations require proper bucket permissions

## Additional Resources

- `HTTP_MODE_SETUP.md` - Detailed HTTP mode setup guide
- `README.md` - Installation and usage documentation
- `migrations/` - SQL migrations for HTTP mode
