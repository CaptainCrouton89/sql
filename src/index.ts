import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "pg";
import { z } from "zod";

if (!process.env.SUPABASE_CONNECTION_STRING) {
  throw new Error("SUPABASE_CONNECTION_STRING is not set");
}

const CONNECTION_STRING = process.env.SUPABASE_CONNECTION_STRING;

const server = new McpServer({
  name: "supabase-sql",
  version: "1.0.0",
});

server.tool(
  "execute-sql",
  "Execute SQL queries on Supabase database",
  {
    query: z.string().describe("The SQL query to execute"),
  },
  async ({ query }) => {
    const client = new Client({
      connectionString: CONNECTION_STRING,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();

      const result = await client.query(query);

      const response = {
        rowCount: result.rowCount,
        rows: result.rows,
        fields:
          result.fields?.map((field) => ({
            name: field.name,
            dataTypeID: field.dataTypeID,
          })) || [],
        command: result.command,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: true,
                message: errorMessage,
              },
              null,
              2
            ),
          },
        ],
      };
    } finally {
      await client.end();
    }
  }
);

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Supabase SQL MCP Server running...");
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

main().catch(console.error);
