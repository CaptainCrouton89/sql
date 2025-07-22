import { Client } from "pg";

export function createDatabaseClient(connectionString: string): Client {
  return new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

export async function executeWithClient<T>(
  connectionString: string,
  operation: (client: Client) => Promise<T>
): Promise<T> {
  const client = createDatabaseClient(connectionString);
  try {
    await client.connect();
    return await operation(client);
  } finally {
    await client.end();
  }
}