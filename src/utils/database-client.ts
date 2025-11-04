import {
  executeSqlViaManagementApi,
  type ManagementApiOptions,
} from "./management-api.js";

export interface ManagementApiConfig {
  projectRef: string;
  accessToken: string;
  apiUrl?: string;
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number | null;
  command?: string;
  fields?: Array<{ name: string; dataTypeID: number }>;
}

/**
 * Database client that uses Supabase Management API
 */
export class DatabaseClient {
  private config: ManagementApiConfig;

  constructor(config: ManagementApiConfig) {
    this.config = config;
  }

  /**
   * Execute a query using Supabase Management API
   */
  async query<T = unknown>(
    query: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
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
}

/**
 * Helper to create a database client from environment variables
 */
export function createDatabaseClientFromEnv(): DatabaseClient {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!projectRef) {
    throw new Error("SUPABASE_PROJECT_REF is required");
  }

  if (!accessToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required");
  }

  return new DatabaseClient({
    projectRef,
    accessToken,
    apiUrl: process.env.SUPABASE_API_URL,
  });
}
