import { Client } from "pg";
import {
  executeSqlViaManagementApi,
  type ManagementApiOptions,
} from "./management-api.js";

export type DatabaseMode = "postgres" | "management-api";

export interface PostgresConfig {
  mode: "postgres";
  connectionString: string;
}

export interface ManagementApiConfig {
  mode: "management-api";
  projectRef: string;
  accessToken: string;
  apiUrl?: string;
}

export type DatabaseConfig = PostgresConfig | ManagementApiConfig;

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number | null;
  command?: string;
  fields?: Array<{ name: string; dataTypeID: number }>;
}

/**
 * Unified database client that works with both direct PostgreSQL
 * connections and Supabase Management API
 */
export class DatabaseClient {
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Execute a query using the configured connection method
   */
  async query<T = unknown>(
    query: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    if (this.config.mode === "postgres") {
      return this.queryPostgres<T>(query, params);
    } else {
      return this.queryManagementApi<T>(query, params);
    }
  }

  /**
   * Execute query via direct PostgreSQL connection
   */
  private async queryPostgres<T>(
    query: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    if (this.config.mode !== "postgres") {
      throw new Error("Invalid configuration for postgres query");
    }

    const client = new Client({
      connectionString: this.config.connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();
      const result = await client.query(query, params);

      return {
        rows: result.rows,
        rowCount: result.rowCount,
        command: result.command,
        fields: result.fields,
      };
    } finally {
      await client.end();
    }
  }

  /**
   * Execute query via Supabase Management API
   */
  private async queryManagementApi<T>(
    query: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    if (this.config.mode !== "management-api") {
      throw new Error("Invalid configuration for management-api query");
    }

    const rows = await executeSqlViaManagementApi<T>({
      projectRef: this.config.projectRef,
      accessToken: this.config.accessToken,
      apiUrl: this.config.apiUrl,
      query,
      parameters: params,
      read_only: false,
    });

    return {
      rows,
      rowCount: rows.length,
    };
  }

  /**
   * Execute an operation with a PostgreSQL client (only for postgres mode)
   * @throws Error if called in management-api mode
   */
  async executeWithClient<T>(
    operation: (client: Client) => Promise<T>
  ): Promise<T> {
    if (this.config.mode !== "postgres") {
      throw new Error(
        "executeWithClient requires postgres mode. Current mode: management-api"
      );
    }

    const client = new Client({
      connectionString: this.config.connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    try {
      await client.connect();
      return await operation(client);
    } finally {
      await client.end();
    }
  }
}

/**
 * Helper to create a database client from environment variables
 */
export function createDatabaseClientFromEnv(): DatabaseClient {
  const rawMode = process.env.DATABASE_MODE;
  const mode: DatabaseMode = rawMode === "management-api" ? "management-api" : "postgres";

  if (mode === "management-api") {
    const projectRef = process.env.SUPABASE_PROJECT_REF;
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

    if (!projectRef) {
      throw new Error(
        "SUPABASE_PROJECT_REF is required for management-api mode"
      );
    }

    if (!accessToken) {
      throw new Error(
        "SUPABASE_ACCESS_TOKEN is required for management-api mode"
      );
    }

    return new DatabaseClient({
      mode: "management-api",
      projectRef,
      accessToken,
      apiUrl: process.env.SUPABASE_API_URL,
    });
  } else {
    const connectionString = process.env.SUPABASE_CONNECTION_STRING;

    if (!connectionString) {
      throw new Error(
        "SUPABASE_CONNECTION_STRING is required for postgres mode"
      );
    }

    return new DatabaseClient({
      mode: "postgres",
      connectionString,
    });
  }
}
