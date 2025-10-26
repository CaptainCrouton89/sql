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
# Connection mode: "postgres" or "management-api"
# - postgres: Direct connection to PostgreSQL (requires port 5432 access)
# - management-api: Uses Supabase Management API over HTTPS (bypasses port 5432)
DATABASE_MODE=management-api

# Required for postgres mode
SUPABASE_CONNECTION_STRING=postgresql://...

# Required for management-api mode
SUPABASE_PROJECT_REF=your-project-ref
SUPABASE_ACCESS_TOKEN=your-access-token
SUPABASE_API_URL=https://api.supabase.com

# Required for storage tools (both modes)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Optional: filter which tools are enabled (comma-separated)
# ENABLED_TOOLS=execute-sql,list-tables,describe-table
```

## Connection Modes

### Management API Mode (Recommended)
- Uses Supabase Management API via `https://api.supabase.com/v1/projects/{ref}/database/query`
- Bypasses port 5432 completely (firewall-friendly)
- Works over HTTPS (port 443)
- No special setup required
- Set `DATABASE_MODE=management-api`
- Requires access token from [Supabase Dashboard](https://supabase.com/dashboard/account/tokens)

### Postgres Mode (Direct Connection)
- Direct PostgreSQL connection on port 5432
- May be blocked by firewalls/VPNs
- Set `DATABASE_MODE=postgres` and provide `SUPABASE_CONNECTION_STRING`

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

### Management API Mode (src/utils/management-api.ts)
Executes SQL via Supabase Management API:
1. Calls `https://api.supabase.com/v1/projects/{ref}/database/query` endpoint
2. Authenticates with access token
3. Returns JSON results formatted as database response

### Database Client Abstraction (src/utils/database-client.ts)
Unified client supporting both connection modes:
- Automatically selects mode based on `DATABASE_MODE` environment variable
- Provides consistent query interface regardless of mode
- Handles type conversions and error formatting

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
