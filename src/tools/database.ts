import { z } from "zod";
import { DatabaseClient } from "../utils/database-client.js";
import { Client } from "pg";
import {
  createErrorResponse,
  createGuidedErrorResponse,
  createMarkdownResponse,
} from "../utils/response.js";

async function getTableStructure(client: Client, tableName: string) {
  try {
    const structureQuery = `
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale
      FROM information_schema.columns c
      WHERE c.table_name = $1 
      ORDER BY c.ordinal_position;
    `;

    const result = await client.query(structureQuery, [tableName]);
    return result.rows;
  } catch {
    return null;
  }
}

async function extractTableFromError(
  error: string,
  query: string
): Promise<string | null> {
  // Try to extract table name from various error patterns
  const patterns = [
    /relation "([^"]+)" does not exist/i,
    /column "[^"]+" of relation "([^"]+)"/i,
    /table "([^"]+)"/i,
    /from ([\w_]+)/i,
    /update ([\w_]+)/i,
    /insert into ([\w_]+)/i,
  ];

  for (const pattern of patterns) {
    const match = error.match(pattern) || query.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

async function createEnhancedErrorResponse(
  error: unknown,
  query: string,
  dbClient: DatabaseClient
) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Check for common SQL errors that could benefit from guidance
  const columnError = errorMessage.match(/column "([^"]+)" does not exist/i);
  const relationError = errorMessage.match(
    /relation "([^"]+)" does not exist/i
  );
  const columnOfRelationError = errorMessage.match(
    /column "([^"]+)" of relation "([^"]+)"/i
  );

  if (columnError || relationError || columnOfRelationError) {
    return await dbClient.executeWithClient(async (client) => {
      let guidance = "";
      const tableName = await extractTableFromError(errorMessage, query);

      if (tableName) {
        const structure = await getTableStructure(client, tableName);

        if (structure && structure.length > 0) {
          guidance += `### Table Structure for '${tableName}'\n\n`;
          guidance += `| Column | Type | Nullable | Default |\n`;
          guidance += `|---|---|---|---|\n`;

          for (const column of structure) {
            const nullable = column.is_nullable === "YES" ? "✓" : "";
            const defaultVal = column.column_default || "";
            const precision = column.numeric_precision
              ? `(${column.numeric_precision}${
                  column.numeric_scale ? `,${column.numeric_scale}` : ""
                })`
              : "";
            const length = column.character_maximum_length
              ? `(${column.character_maximum_length})`
              : "";
            const type = `${column.data_type}${precision}${length}`;

            guidance += `| ${column.column_name} | ${type} | ${nullable} | ${defaultVal} |\n`;
          }

          if (columnError) {
            const missingColumn = columnError[1];
            guidance += `\n**The column '${missingColumn}' does not exist**\n`;
          }
        } else if (relationError) {
          // Table doesn't exist, let's list available tables
          try {
            const tablesQuery = `
              SELECT table_name 
              FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_type = 'BASE TABLE'
              ORDER BY table_name;
            `;
            const tablesResult = await client.query(tablesQuery);

            if (tablesResult.rows.length > 0) {
              guidance += `### Available Tables\n\n`;
              guidance += tablesResult.rows
                .map((t: any) => `- ${t.table_name}`)
                .join("\n");
              guidance += `\n\n**The table '${tableName}' does not exist**\n`;
            }
          } catch {}
        }
      }

      if (!guidance) {
        // Provide general SQL error guidance
        guidance += `### Common Issues\n\n`;
        guidance += `- **Column doesn't exist**: Check column names using \`describe-table\`\n`;
        guidance += `- **Table doesn't exist**: List available tables using \`list-tables\`\n`;
        guidance += `- **Syntax error**: Review SQL syntax and quotes\n`;
        guidance += `- **Permission denied**: Check database permissions\n\n`;
        guidance += `### Next Steps\n\n`;
        guidance += `1. Use \`list-tables\` to see available tables\n`;
        guidance += `2. Use \`describe-table\` to see table structure\n`;
        guidance += `3. Verify column and table names match exactly (case-sensitive)\n`;
      }

      return createGuidedErrorResponse(error, guidance);
    });
  }

  // For other errors, provide general guidance
  let guidance = `### Query Analysis\n\n`;
  guidance += `**Query**: \`${query}\`\n\n`;
  guidance += `### Debugging Steps\n\n`;
  guidance += `1. Check syntax - Ensure SQL syntax is correct\n`;
  guidance += `2. Verify permissions - Ensure you have access to the requested resources\n`;
  guidance += `3. Review data types - Ensure values match column data types\n\n`;
  guidance += `### Helpful Commands\n\n`;
  guidance += `- \`list-tables\` - See all available tables\n`;
  guidance += `- \`describe-table\` - Get detailed table structure\n`;
  guidance += `- \`describe-functions\` - List available database functions\n`;

  return createGuidedErrorResponse(error, guidance);
}

export function createExecuteSqlTool(dbClient: DatabaseClient) {
  return {
    name: "execute-sql",
    description:
      "Execute SQL queries on Supabase database. Remember to fetch the table structure before guessing at the schema.",
    inputSchema: {
      query: z.string().describe("The SQL query to execute"),
    },
    handler: async ({ query }: { query: string }) => {
      try {
        const result = await dbClient.query(query);

        // For Management API mode, we don't have field types, so format differently
        let markdown = `### Query Result\n\n`;

        if (result.command) {
          markdown += `**Command**: ${result.command}\n`;
        }

        if (result.rowCount !== null && result.rowCount !== undefined) {
          markdown += `**Rows affected**: ${result.rowCount}\n`;
        }

        markdown += `\n`;

        if (result.rows && result.rows.length > 0) {
          const firstRow = result.rows[0];
          if (typeof firstRow !== 'object' || firstRow === null) {
            throw new Error('Unexpected row format');
          }
          const headers = Object.keys(firstRow);

          markdown += `| ${headers.join(" | ")} |\n`;
          markdown += `|${headers.map(() => "---").join("|")}|\n`;

          // Add data rows
          for (const row of result.rows) {
            const values = headers.map((h) => {
              const val = (row as Record<string, unknown>)[h];
              if (val === null) return "*null*";
              if (val === "") return "*empty*";
              if (typeof val === "object") return JSON.stringify(val);
              return String(val);
            });
            markdown += `| ${values.join(" | ")} |\n`;
          }
        } else if (result.command) {
          markdown += `*Query executed successfully*`;
        } else {
          markdown += `*No rows returned*`;
        }

        return createMarkdownResponse(markdown);
      } catch (error) {
        return createEnhancedErrorResponse(error, query, dbClient);
      }
    },
  };
}

export function createDescribeTableTool(dbClient: DatabaseClient) {
  return {
    name: "describe-table",
    description:
      "Get table structure, including constraints, RLS policies, triggers, indexes, dependencies, and referenced by. Use this first before making specific queries against a table.",
    inputSchema: {
      tableName: z.string().describe("The name of the table to describe"),
      includeConstraints: z
        .boolean()
        .optional()
        .describe("Whether to include constraints"),
      includeRlsPolicies: z
        .boolean()
        .optional()
        .describe("Whether to include RLS policies"),
      includeTriggers: z
        .boolean()
        .optional()
        .describe("Whether to include triggers"),
      includeIndexes: z
        .boolean()
        .optional()
        .describe("Whether to include indexes")
        .default(false),
      includeDependencies: z
        .boolean()
        .optional()
        .describe("Whether to include dependencies")
        .default(false),
      includeReferencedBy: z
        .boolean()
        .optional()
        .describe("Whether to include tables that reference this table")
        .default(false),
      includeSampleRows: z
        .boolean()
        .optional()
        .describe("Whether to include sample rows"),
    },
    handler: async ({
      tableName,
      includeConstraints = false,
      includeRlsPolicies = false,
      includeTriggers = false,
      includeIndexes = false,
      includeDependencies = false,
      includeReferencedBy = false,
      includeSampleRows = false,
    }: {
      tableName: string;
      includeConstraints?: boolean;
      includeRlsPolicies?: boolean;
      includeTriggers?: boolean;
      includeIndexes?: boolean;
      includeDependencies?: boolean;
      includeReferencedBy?: boolean;
      includeSampleRows?: boolean;
    }) => {
      try {
        return await dbClient.executeWithClient(async (client) => {
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

          const rlsPoliciesQuery = `
            SELECT 
              pol.polname as policy_name,
              pol.polpermissive as is_permissive,
              pol.polroles as roles,
              pol.polcmd as command,
              pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
              pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expression
            FROM pg_policy pol
            JOIN pg_class pc ON pol.polrelid = pc.oid
            WHERE pc.relname = $1
            ORDER BY pol.polname;
          `;

          const triggersQuery = `
            SELECT 
              t.trigger_name,
              t.event_manipulation as event,
              t.event_object_table as table_name,
              t.action_timing as timing,
              t.action_statement as definition,
              t.action_condition as condition,
              t.action_orientation as orientation
            FROM information_schema.triggers t
            WHERE t.event_object_table = $1
            ORDER BY t.trigger_name;
          `;

          const indexesQuery = `
            SELECT 
              i.indexname as index_name,
              i.tablename as table_name,
              i.indexdef as definition,
              idx.indisunique as is_unique,
              idx.indisprimary as is_primary,
              idx.indisexclusion as is_exclusion,
              idx.indimmediate as is_immediate,
              idx.indisclustered as is_clustered,
              idx.indisvalid as is_valid,
              am.amname as index_type,
              pg_size_pretty(pg_relation_size(idx_class.oid)) as size
            FROM pg_indexes i
            JOIN pg_class c ON c.relname = i.tablename
            JOIN pg_index idx ON idx.indrelid = c.oid
            JOIN pg_class idx_class ON idx_class.oid = idx.indexrelid AND idx_class.relname = i.indexname
            JOIN pg_am am ON am.oid = idx_class.relam
            WHERE i.tablename = $1
            ORDER BY i.indexname;
          `;

          const dependenciesQuery = `
            SELECT DISTINCT
              d.classid::regclass AS object_type,
              d.objid::regclass AS object_name,
              d.objsubid AS object_subid,
              d.refclassid::regclass AS referenced_type,
              d.refobjid::regclass AS referenced_name,
              d.refobjsubid AS referenced_subid,
              d.deptype AS dependency_type,
              CASE d.deptype
                WHEN 'n' THEN 'normal'
                WHEN 'a' THEN 'auto'
                WHEN 'i' THEN 'internal'
                WHEN 'e' THEN 'extension'
                WHEN 'p' THEN 'pin'
                WHEN 'x' THEN 'extension member'
              END AS dependency_type_desc
            FROM pg_depend d
            JOIN pg_class c ON d.objid = c.oid
            WHERE c.relname = $1
            AND d.deptype IN ('n', 'a', 'i')
            ORDER BY dependency_type, referenced_name;
          `;

          const referencedByQuery = `
            SELECT DISTINCT
              tc.table_name AS referencing_table,
              kcu.column_name AS referencing_column,
              ccu.table_name AS referenced_table,
              ccu.column_name AS referenced_column,
              tc.constraint_name,
              rc.update_rule,
              rc.delete_rule
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name
              AND tc.table_schema = ccu.table_schema
            JOIN information_schema.referential_constraints rc
              ON tc.constraint_name = rc.constraint_name
              AND tc.table_schema = rc.constraint_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name = $1
            ORDER BY tc.table_name, kcu.column_name;
          `;

          const queries = [client.query(structureQuery, [tableName])];

          if (includeConstraints) {
            queries.push(client.query(constraintsQuery, [tableName]));
          }

          if (includeSampleRows) {
            queries.push(client.query(sampleQuery));
          }

          if (includeRlsPolicies) {
            queries.push(client.query(rlsPoliciesQuery, [tableName]));
          }

          if (includeTriggers) {
            queries.push(client.query(triggersQuery, [tableName]));
          }

          if (includeIndexes) {
            queries.push(client.query(indexesQuery, [tableName]));
          }

          if (includeDependencies) {
            queries.push(client.query(dependenciesQuery, [tableName]));
          }

          if (includeReferencedBy) {
            queries.push(client.query(referencedByQuery, [tableName]));
          }

          const results = await Promise.all(queries);
          const structureResult = results[0];

          let constraintsResult = null;
          let sampleResult = null;
          let rlsPoliciesResult = null;
          let triggersResult = null;
          let indexesResult = null;
          let dependenciesResult = null;
          let referencedByResult = null;

          let queryIndex = 1;

          if (includeConstraints) {
            constraintsResult = results[queryIndex++];
          }

          if (includeSampleRows) {
            sampleResult = results[queryIndex++];
          }

          if (includeRlsPolicies) {
            rlsPoliciesResult = results[queryIndex++];
          }

          if (includeTriggers) {
            triggersResult = results[queryIndex++];
          }

          if (includeIndexes) {
            indexesResult = results[queryIndex++];
          }

          if (includeDependencies) {
            dependenciesResult = results[queryIndex++];
          }

          if (includeReferencedBy) {
            referencedByResult = results[queryIndex++];
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
            response.constraints = constraintsResult.rows.filter(
              (constraint) =>
                constraint.constraint_name && constraint.constraint_type
            );
          }

          if (includeSampleRows && sampleResult) {
            response.sampleRows = sampleResult.rows;
            response.rowCount = sampleResult.rowCount;
          }

          if (includeRlsPolicies && rlsPoliciesResult) {
            response.rlsPolicies = rlsPoliciesResult.rows
              .filter((policy) => policy.policy_name)
              .map((policy) => ({
                policyName: policy.policy_name,
                isPermissive: policy.is_permissive,
                roles: policy.roles,
                command: policy.command,
                ...(policy.using_expression && {
                  usingExpression: policy.using_expression,
                }),
                ...(policy.with_check_expression && {
                  withCheckExpression: policy.with_check_expression,
                }),
              }));
          }

          if (includeTriggers && triggersResult) {
            response.triggers = triggersResult.rows
              .filter((trigger) => trigger.trigger_name)
              .map((trigger) => ({
                triggerName: trigger.trigger_name,
                event: trigger.event,
                tableName: trigger.table_name,
                timing: trigger.timing,
                definition: trigger.definition,
                ...(trigger.condition && { condition: trigger.condition }),
                orientation: trigger.orientation,
              }));
          }

          if (includeIndexes && indexesResult) {
            response.indexes = indexesResult.rows.map((index) => ({
              indexName: index.index_name,
              tableName: index.table_name,
              definition: index.definition,
              isUnique: index.is_unique,
              isPrimary: index.is_primary,
              isExclusion: index.is_exclusion,
              isImmediate: index.is_immediate,
              isClustered: index.is_clustered,
              isValid: index.is_valid,
              indexType: index.index_type,
              size: index.size,
            }));
          }

          if (includeDependencies && dependenciesResult) {
            response.dependencies = dependenciesResult.rows.map((dep) => ({
              objectType: dep.object_type,
              objectName: dep.object_name,
              objectSubid: dep.object_subid,
              referencedType: dep.referenced_type,
              referencedName: dep.referenced_name,
              referencedSubid: dep.referenced_subid,
              dependencyType: dep.dependency_type,
              dependencyTypeDesc: dep.dependency_type_desc,
            }));
          }

          if (includeReferencedBy && referencedByResult) {
            response.referencedBy = referencedByResult.rows.map((ref) => ({
              referencingTable: ref.referencing_table,
              referencingColumn: ref.referencing_column,
              referencedTable: ref.referenced_table,
              referencedColumn: ref.referenced_column,
              constraintName: ref.constraint_name,
              updateRule: ref.update_rule,
              deleteRule: ref.delete_rule,
            }));
          }

          // Create markdown format for more token efficiency
          let markdown = `## ${tableName}\n\n`;

          // Table structure
          markdown += `| Column | Type | Nullable | Default |\n`;
          markdown += `|---|---|---|---|\n`;

          for (const column of enrichedStructure) {
            const nullable = column.is_nullable === "YES" ? "✓" : "";
            const defaultVal = column.column_default || "";
            const precision = column.numeric_precision
              ? `(${column.numeric_precision}${
                  column.numeric_scale ? `,${column.numeric_scale}` : ""
                })`
              : "";
            const length = column.character_maximum_length
              ? `(${column.character_maximum_length})`
              : "";
            const type = `${column.data_type}${precision}${length}`;

            markdown += `| ${column.column_name} | ${type} | ${nullable} | ${defaultVal} |\n`;

            // Add constraints inline if any
            if (includeConstraints && column.constraints?.length > 0) {
              for (const constraint of column.constraints) {
                const fk =
                  constraint.foreignTable && constraint.foreignColumn
                    ? ` → ${constraint.foreignTable}.${constraint.foreignColumn}`
                    : "";
                markdown += `|   | *${constraint.type}*${fk} | | |\n`;
              }
            }
          }

          // Table-level constraints
          if (
            includeConstraints &&
            constraintsResult &&
            constraintsResult.rows.length > 0
          ) {
            const tableConstraints = constraintsResult.rows.filter(
              (c) => !c.column_name
            );
            if (tableConstraints.length > 0) {
              markdown += `\n### Constraints\n`;
              for (const constraint of tableConstraints) {
                markdown += `- **${constraint.constraint_name}** (${constraint.constraint_type})`;
                if (constraint.check_clause) {
                  markdown += `: ${constraint.check_clause}`;
                }
                markdown += `\n`;
              }
            }
          }

          // Sample rows
          if (
            includeSampleRows &&
            sampleResult &&
            sampleResult.rows.length > 0
          ) {
            markdown += `\n### Sample Data\n`;
            const rows = sampleResult.rows;
            const headers = Object.keys(rows[0]);

            markdown += `| ${headers.join(" | ")} |\n`;
            markdown += `|${headers.map(() => "---").join("|")}|\n`;

            for (const row of rows) {
              const values = headers.map((h) => {
                const val = row[h];
                return val === null ? "*null*" : String(val);
              });
              markdown += `| ${values.join(" | ")} |\n`;
            }
          }

          // RLS Policies
          if (
            includeRlsPolicies &&
            rlsPoliciesResult &&
            rlsPoliciesResult.rows.length > 0
          ) {
            markdown += `\n### RLS Policies\n`;
            for (const policy of rlsPoliciesResult.rows.filter(
              (p) => p.policy_name
            )) {
              markdown += `- **${policy.policy_name}** (${policy.command})\n`;
              if (policy.using_expression) {
                markdown += `  - Using: ${policy.using_expression}\n`;
              }
              if (policy.with_check_expression) {
                markdown += `  - Check: ${policy.with_check_expression}\n`;
              }
            }
          }

          // Triggers
          if (
            includeTriggers &&
            triggersResult &&
            triggersResult.rows.length > 0
          ) {
            markdown += `\n### Triggers\n`;
            for (const trigger of triggersResult.rows.filter(
              (t) => t.trigger_name
            )) {
              markdown += `- **${trigger.trigger_name}** (${trigger.timing} ${trigger.event})\n`;
            }
          }

          // Indexes
          if (
            includeIndexes &&
            indexesResult &&
            indexesResult.rows.length > 0
          ) {
            markdown += `\n### Indexes\n`;
            for (const index of indexesResult.rows) {
              const flags = [];
              if (index.is_primary) flags.push("PRIMARY");
              if (index.is_unique) flags.push("UNIQUE");
              const flagStr = flags.length > 0 ? ` (${flags.join(", ")})` : "";
              markdown += `- **${index.index_name}**${flagStr} - ${index.size}\n`;
            }
          }

          // Dependencies
          if (
            includeDependencies &&
            dependenciesResult &&
            dependenciesResult.rows.length > 0
          ) {
            markdown += `\n### Dependencies\n`;
            for (const dep of dependenciesResult.rows) {
              markdown += `- ${dep.object_name} → ${dep.referenced_name} (${dep.dependency_type_desc})\n`;
            }
          }

          // Referenced by
          if (
            includeReferencedBy &&
            referencedByResult &&
            referencedByResult.rows.length > 0
          ) {
            markdown += `\n### Referenced By\n`;
            for (const ref of referencedByResult.rows) {
              markdown += `- ${ref.referencing_table}.${ref.referencing_column}\n`;
            }
          }

          return createMarkdownResponse(markdown);
        });
      } catch (error) {
        return createGuidedErrorResponse(
          error,
          `### Troubleshooting\n\n` +
            `- Check that the table name is spelled correctly\n` +
            `- Use \`list-tables\` to see available tables\n` +
            `- Verify you have permissions to access this table\n`
        );
      }
    },
  };
}

export function createDescribeFunctionsTool(dbClient: DatabaseClient) {
  return {
    name: "describe-functions",
    description: "Get function signatures from the database",
    inputSchema: {
      schemaName: z
        .string()
        .optional()
        .describe("Schema name (defaults to 'public')"),
    },
    handler: async ({ schemaName = "public" }: { schemaName?: string }) => {
      try {
        return await dbClient.executeWithClient(async (client) => {
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

          // Format as markdown
          let markdown = `## Functions in ${schemaName}\n\n`;

          if (result.rows.length === 0) {
            markdown += `*No functions found in schema '${schemaName}'*`;
          } else {
            markdown += `| Function | Arguments | Returns | Type | Description |\n`;
            markdown += `|---|---|---|---|---|\n`;

            for (const row of result.rows) {
              const kind =
                row.function_kind === "f"
                  ? "Function"
                  : row.function_kind === "p"
                  ? "Procedure"
                  : row.function_kind === "a"
                  ? "Aggregate"
                  : "Unknown";
              const desc = row.description || "";
              const args = row.arguments || "";
              const returns = row.return_type || "";

              markdown += `| ${row.function_name} | ${args} | ${returns} | ${kind} | ${desc} |\n`;
            }

            markdown += `\n*${result.rowCount} functions total*`;
          }

          return createMarkdownResponse(markdown);
        });
      } catch (error) {
        return createGuidedErrorResponse(
          error,
          `### Troubleshooting\n\n` +
            `- Check that the table name is spelled correctly\n` +
            `- Use \`list-tables\` to see available tables\n` +
            `- Verify you have permissions to access this table\n`
        );
      }
    },
  };
}

export function createListTablesTool(dbClient: DatabaseClient) {
  return {
    name: "list-tables",
    description: "List all tables in a schema with row counts",
    inputSchema: {
      schemaName: z
        .string()
        .optional()
        .describe("Schema name (defaults to 'public')"),
    },
    handler: async ({ schemaName = "public" }: { schemaName?: string }) => {
      try {
        return await dbClient.executeWithClient(async (client) => {
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

          // Create markdown format for table list
          let markdown = `## Tables in ${schemaName}\n\n`;
          markdown += `| Table | Columns | Rows |\n`;
          markdown += `|---|---|---|\n`;

          for (const table of tablesWithRowCounts) {
            const rowCount =
              table.row_count !== null
                ? table.row_count.toLocaleString()
                : "Error";
            markdown += `| ${table.table_name} | ${table.column_count} | ${rowCount} |\n`;
          }

          markdown += `\n*${result.rowCount} tables total*`;

          return createMarkdownResponse(markdown);
        });
      } catch (error) {
        return createGuidedErrorResponse(
          error,
          `### Troubleshooting\n\n` +
            `- Check that the table name is spelled correctly\n` +
            `- Use \`list-tables\` to see available tables\n` +
            `- Verify you have permissions to access this table\n`
        );
      }
    },
  };
}

export function createGetFunctionDefinitionTool(dbClient: DatabaseClient) {
  return {
    name: "get-function-definition",
    description: "Get the complete definition of a single RPC function",
    inputSchema: {
      functionName: z
        .string()
        .describe("The name of the function to get definition for"),
      schemaName: z
        .string()
        .optional()
        .describe("Schema name (defaults to 'public')"),
    },
    handler: async ({
      functionName,
      schemaName = "public",
    }: {
      functionName: string;
      schemaName?: string;
    }) => {
      try {
        return await dbClient.executeWithClient(async (client) => {
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
            return createErrorResponse(
              `Function '${functionName}' not found in schema '${schemaName}'`
            );
          }

          const func = result.rows[0];

          // Format as markdown
          let markdown = `## Function: ${func.function_name}\n\n`;

          if (func.description) {
            markdown += `**Description**: ${func.description}\n\n`;
          }

          markdown += `### Signature\n`;
          markdown += `\`\`\`sql\n`;
          markdown += `${func.function_name}(${func.arguments || ""})\n`;
          markdown += `RETURNS ${func.return_type}\n`;
          markdown += `\`\`\`\n\n`;

          markdown += `### Properties\n`;
          markdown += `- **Language**: ${func.language}\n`;
          markdown += `- **Type**: ${
            func.function_kind === "f"
              ? "Function"
              : func.function_kind === "p"
              ? "Procedure"
              : func.function_kind === "a"
              ? "Aggregate"
              : "Unknown"
          }\n`;
          markdown += `- **Volatility**: ${func.volatility_label}\n`;
          markdown += `- **Security Definer**: ${
            func.security_definer ? "Yes" : "No"
          }\n`;
          markdown += `- **Strict**: ${func.is_strict ? "Yes" : "No"}\n`;
          markdown += `- **Returns Set**: ${
            func.returns_set ? "Yes" : "No"
          }\n\n`;

          markdown += `### Definition\n`;
          markdown += `\`\`\`sql\n`;
          markdown += func.definition;
          markdown += `\n\`\`\`\n`;

          return createMarkdownResponse(markdown);
        });
      } catch (error) {
        return createGuidedErrorResponse(
          error,
          `### Troubleshooting\n\n` +
            `- Check that the table name is spelled correctly\n` +
            `- Use \`list-tables\` to see available tables\n` +
            `- Verify you have permissions to access this table\n`
        );
      }
    },
  };
}
