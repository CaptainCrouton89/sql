import axios, { AxiosInstance } from "axios";

export interface ExecuteSqlOptions {
  query: string;
  parameters?: unknown[];
  read_only?: boolean;
}

export interface ManagementApiOptions {
  projectRef: string;
  accessToken: string;
  apiUrl?: string;
}

/**
 * Creates an Axios client configured for Supabase Management API
 */
export function createManagementApiClient(
  options: ManagementApiOptions
): AxiosInstance {
  const { apiUrl = "https://api.supabase.com", accessToken } = options;

  return axios.create({
    baseURL: apiUrl,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Executes SQL via Supabase Management API
 * Uses /v1/projects/{ref}/database/query endpoint
 * This bypasses port 5432 and works over HTTPS
 */
export async function executeSqlViaManagementApi<T = any>(
  options: ManagementApiOptions & ExecuteSqlOptions
): Promise<T[]> {
  const { projectRef, query, parameters, read_only } = options;
  const client = createManagementApiClient(options);

  try {
    const response = await client.post<T[]>(
      `/v1/projects/${projectRef}/database/query`,
      {
        query,
        parameters,
        read_only,
      }
    );

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message;
      const status = error.response?.status ?? null;
      const statusText = status !== null ? `${status}` : "network error";
      throw new Error(`Management API error: ${message} (${statusText})`);
    }
    throw error;
  }
}
