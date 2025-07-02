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

server.tool(
  "describe-table",
  "Get table structure and 3 sample rows",
  {
    tableName: z.string().describe("The name of the table to describe"),
    includeConstraints: z
      .boolean()
      .optional()
      .describe("Whether to include constraints"),
    includeSampleRows: z
      .boolean()
      .optional()
      .describe("Whether to include sample rows")
      .default(false),
  },
  async ({
    tableName,
    includeConstraints = false,
    includeSampleRows = false,
  }) => {
    const client = new Client({
      connectionString: CONNECTION_STRING,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();

      const structureQuery = `
        SELECT 
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.ordinal_position
        FROM information_schema.columns c
        WHERE c.table_name = $1 
        ORDER BY c.ordinal_position;
      `;

      const constraintsQuery = `
        SELECT 
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.update_rule,
          rc.delete_rule,
          cc.check_clause
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
        LEFT JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
          AND tc.table_schema = rc.constraint_schema
        LEFT JOIN information_schema.check_constraints cc
          ON tc.constraint_name = cc.constraint_name
          AND tc.table_schema = cc.constraint_schema
        WHERE tc.table_name = $1
        ORDER BY tc.constraint_name;
      `;

      const sampleQuery = `SELECT * FROM ${tableName} LIMIT 3;`;

      const queries = [client.query(structureQuery, [tableName])];

      if (includeConstraints) {
        queries.push(client.query(constraintsQuery, [tableName]));
      }

      if (includeSampleRows) {
        queries.push(client.query(sampleQuery));
      }

      const results = await Promise.all(queries);
      const structureResult = results[0];

      let constraintsResult = null;
      let sampleResult = null;

      if (includeConstraints && includeSampleRows) {
        constraintsResult = results[1];
        sampleResult = results[2];
      } else if (includeConstraints) {
        constraintsResult = results[1];
      } else if (includeSampleRows) {
        sampleResult = results[1];
      }

      const constraintsByColumn = constraintsResult
        ? constraintsResult.rows.reduce((acc, constraint) => {
            if (constraint.column_name) {
              if (!acc[constraint.column_name]) {
                acc[constraint.column_name] = [];
              }
              acc[constraint.column_name].push({
                name: constraint.constraint_name,
                type: constraint.constraint_type,
                foreignTable: constraint.foreign_table_name,
                foreignColumn: constraint.foreign_column_name,
                updateRule: constraint.update_rule,
                deleteRule: constraint.delete_rule,
                checkClause: constraint.check_clause,
              });
            }
            return acc;
          }, {} as Record<string, any[]>)
        : {};

      const enrichedStructure = structureResult.rows.map((column) => ({
        ...column,
        ...(includeConstraints && {
          constraints: constraintsByColumn[column.column_name] || [],
        }),
      }));

      const response: any = {
        tableName,
        structure: enrichedStructure,
      };

      if (includeConstraints && constraintsResult) {
        response.constraints = constraintsResult.rows;
      }

      if (includeSampleRows && sampleResult) {
        response.sampleRows = sampleResult.rows;
        response.rowCount = sampleResult.rowCount;
      }

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

server.tool(
  "describe-functions",
  "Get function signatures from the database",
  {
    schemaName: z
      .string()
      .optional()
      .describe("Schema name (defaults to 'public')"),
  },
  async ({ schemaName = "public" }) => {
    const client = new Client({
      connectionString: CONNECTION_STRING,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();

      const functionsQuery = `
        SELECT 
          p.proname as function_name,
          pg_catalog.pg_get_function_result(p.oid) as return_type,
          pg_catalog.pg_get_function_arguments(p.oid) as arguments,
          p.prokind as function_kind,
          d.description
        FROM pg_catalog.pg_proc p
        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        LEFT JOIN pg_catalog.pg_description d ON d.objoid = p.oid
        WHERE n.nspname = $1
        ORDER BY p.proname;
      `;

      const result = await client.query(functionsQuery, [schemaName]);

      const response = {
        schemaName,
        functions: result.rows.map((row) => ({
          name: row.function_name,
          returnType: row.return_type,
          arguments: row.arguments,
          kind:
            row.function_kind === "f"
              ? "function"
              : row.function_kind === "p"
              ? "procedure"
              : row.function_kind === "a"
              ? "aggregate"
              : "unknown",
          description: row.description || null,
        })),
        count: result.rowCount,
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

server.tool(
  "list-tables",
  "List all tables in a schema with row counts",
  {
    schemaName: z
      .string()
      .optional()
      .describe("Schema name (defaults to 'public')"),
  },
  async ({ schemaName = "public" }) => {
    const client = new Client({
      connectionString: CONNECTION_STRING,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();

      const tablesQuery = `
        SELECT 
          t.table_name,
          t.table_type,
          obj_description(c.oid) as table_comment,
          (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = $1) as column_count
        FROM information_schema.tables t
        LEFT JOIN pg_class c ON c.relname = t.table_name
        LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.table_schema = $1
        AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name;
      `;

      const result = await client.query(tablesQuery, [schemaName]);

      const tablesWithRowCounts = await Promise.all(
        result.rows.map(async (table) => {
          try {
            const countResult = await client.query(
              `SELECT COUNT(*) as row_count FROM "${table.table_name}"`
            );
            return {
              ...table,
              row_count: parseInt(countResult.rows[0].row_count),
            };
          } catch (error) {
            return {
              ...table,
              row_count: null,
              error: "Could not get row count",
            };
          }
        })
      );

      const response = {
        schemaName,
        tables: tablesWithRowCounts,
        count: result.rowCount,
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

server.tool(
  "show-constraints",
  "Show all constraints (foreign keys, unique, check, etc.) for a table or schema",
  {
    tableName: z.string().optional().describe("Specific table name (optional)"),
    schemaName: z
      .string()
      .optional()
      .describe("Schema name (defaults to 'public')"),
  },
  async ({ tableName, schemaName = "public" }) => {
    const client = new Client({
      connectionString: CONNECTION_STRING,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();

      let constraintsQuery = `
        SELECT 
          tc.table_name,
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.update_rule,
          rc.delete_rule,
          cc.check_clause
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
        LEFT JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
          AND tc.table_schema = rc.constraint_schema
        LEFT JOIN information_schema.check_constraints cc
          ON tc.constraint_name = cc.constraint_name
          AND tc.table_schema = cc.constraint_schema
        WHERE tc.table_schema = $1
      `;

      const params = [schemaName];

      if (tableName) {
        constraintsQuery += " AND tc.table_name = $2";
        params.push(tableName);
      }

      constraintsQuery += " ORDER BY tc.table_name, tc.constraint_name;";

      const result = await client.query(constraintsQuery, params);

      const groupedConstraints = result.rows.reduce((acc, row) => {
        const table = row.table_name;
        if (!acc[table]) {
          acc[table] = [];
        }

        acc[table].push({
          constraintName: row.constraint_name,
          constraintType: row.constraint_type,
          columnName: row.column_name,
          foreignTableName: row.foreign_table_name,
          foreignColumnName: row.foreign_column_name,
          updateRule: row.update_rule,
          deleteRule: row.delete_rule,
          checkClause: row.check_clause,
        });

        return acc;
      }, {} as Record<string, any[]>);

      const response = {
        schemaName,
        tableName: tableName || "all tables",
        constraints: groupedConstraints,
        totalConstraints: result.rowCount,
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

server.tool(
  "get-function-definition",
  "Get the complete definition of a single RPC function",
  {
    functionName: z
      .string()
      .describe("The name of the function to get definition for"),
    schemaName: z
      .string()
      .optional()
      .describe("Schema name (defaults to 'public')"),
  },
  async ({ functionName, schemaName = "public" }) => {
    const client = new Client({
      connectionString: CONNECTION_STRING,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();

      const functionQuery = `
        SELECT 
          p.proname as function_name,
          pg_catalog.pg_get_function_result(p.oid) as return_type,
          pg_catalog.pg_get_function_arguments(p.oid) as arguments,
          pg_catalog.pg_get_functiondef(p.oid) as definition,
          p.prokind as function_kind,
          p.provolatile as volatility,
          p.prosecdef as security_definer,
          p.proisstrict as is_strict,
          p.proretset as returns_set,
          l.lanname as language,
          d.description,
          p.prosrc as source_code,
          CASE p.provolatile
            WHEN 'i' THEN 'IMMUTABLE'
            WHEN 's' THEN 'STABLE'
            WHEN 'v' THEN 'VOLATILE'
          END as volatility_label
        FROM pg_catalog.pg_proc p
        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
        LEFT JOIN pg_catalog.pg_description d ON d.objoid = p.oid
        WHERE n.nspname = $1 AND p.proname = $2;
      `;

      const result = await client.query(functionQuery, [
        schemaName,
        functionName,
      ]);

      if (result.rowCount === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: `Function '${functionName}' not found in schema '${schemaName}'`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const func = result.rows[0];
      const response = {
        schemaName,
        functionName: func.function_name,
        returnType: func.return_type,
        arguments: func.arguments,
        definition: func.definition,
        sourceCode: func.source_code,
        language: func.language,
        kind:
          func.function_kind === "f"
            ? "function"
            : func.function_kind === "p"
            ? "procedure"
            : func.function_kind === "a"
            ? "aggregate"
            : "unknown",
        volatility: func.volatility_label,
        securityDefiner: func.security_definer,
        isStrict: func.is_strict,
        returnsSet: func.returns_set,
        description: func.description || null,
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
