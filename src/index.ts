#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { createDatabaseClientFromEnv } from "./utils/database-client.js";
import {
  createExecuteSqlTool,
  createDescribeTableTool,
  createDescribeFunctionsTool,
  createListTablesTool,
  createGetFunctionDefinitionTool,
} from "./tools/database.js";
import {
  createUploadFileTool,
  createDeleteFileTool,
  createListFilesTool,
  createDownloadFileTool,
  createCreateBucketTool,
  createDeleteBucketTool,
  createMoveFileTool,
  createCopyFileTool,
  createGenerateSignedUrlTool,
  createGetFileInfoTool,
  createListBucketsTool,
  createEmptyBucketTool,
} from "./tools/storage.js";

config({ path: ".env.local" });

// Validate required environment variables
if (!process.env.SUPABASE_PROJECT_REF) {
  throw new Error("SUPABASE_PROJECT_REF is required");
}
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  throw new Error("SUPABASE_ACCESS_TOKEN is required");
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is not set");
}

// Create database client based on mode
const dbClient = createDatabaseClientFromEnv();

// Construct SUPABASE_URL from project ref
const SUPABASE_URL = process.env.SUPABASE_URL ||
  (process.env.SUPABASE_PROJECT_REF ? `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co` : undefined);

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL or SUPABASE_PROJECT_REF is required");
}

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ENABLED_TOOLS = process.env.ENABLED_TOOLS?.split(',').map(t => t.trim()) || [];
const isToolEnabled = (toolName: string) => ENABLED_TOOLS.length === 0 || ENABLED_TOOLS.includes(toolName);

const server = new McpServer({
  name: "supabase",
  version: "1.0.0",
});

// Database tools
if (isToolEnabled('execute-sql')) {
  const executeSqlTool = createExecuteSqlTool(dbClient);
  server.tool(executeSqlTool.name, executeSqlTool.description, executeSqlTool.inputSchema, executeSqlTool.handler);
}

if (isToolEnabled('describe-table')) {
  const describeTableTool = createDescribeTableTool(dbClient);
  server.tool(describeTableTool.name, describeTableTool.description, describeTableTool.inputSchema, describeTableTool.handler);
}

if (isToolEnabled('describe-functions')) {
  const describeFunctionsTool = createDescribeFunctionsTool(dbClient);
  server.tool(describeFunctionsTool.name, describeFunctionsTool.description, describeFunctionsTool.inputSchema, describeFunctionsTool.handler);
}

if (isToolEnabled('list-tables')) {
  const listTablesTool = createListTablesTool(dbClient);
  server.tool(listTablesTool.name, listTablesTool.description, listTablesTool.inputSchema, listTablesTool.handler);
}

if (isToolEnabled('get-function-definition')) {
  const getFunctionDefinitionTool = createGetFunctionDefinitionTool(dbClient);
  server.tool(getFunctionDefinitionTool.name, getFunctionDefinitionTool.description, getFunctionDefinitionTool.inputSchema, getFunctionDefinitionTool.handler);
}

// Storage tools
if (isToolEnabled('upload-file')) {
  const uploadFileTool = createUploadFileTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(uploadFileTool.name, uploadFileTool.description, uploadFileTool.inputSchema, uploadFileTool.handler);
}

if (isToolEnabled('delete-file')) {
  const deleteFileTool = createDeleteFileTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(deleteFileTool.name, deleteFileTool.description, deleteFileTool.inputSchema, deleteFileTool.handler);
}

if (isToolEnabled('list-files')) {
  const listFilesTool = createListFilesTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(listFilesTool.name, listFilesTool.description, listFilesTool.inputSchema, listFilesTool.handler);
}

if (isToolEnabled('download-file')) {
  const downloadFileTool = createDownloadFileTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(downloadFileTool.name, downloadFileTool.description, downloadFileTool.inputSchema, downloadFileTool.handler);
}

if (isToolEnabled('create-bucket')) {
  const createBucketTool = createCreateBucketTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(createBucketTool.name, createBucketTool.description, createBucketTool.inputSchema, createBucketTool.handler);
}

if (isToolEnabled('delete-bucket')) {
  const deleteBucketTool = createDeleteBucketTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(deleteBucketTool.name, deleteBucketTool.description, deleteBucketTool.inputSchema, deleteBucketTool.handler);
}

if (isToolEnabled('move-file')) {
  const moveFileTool = createMoveFileTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(moveFileTool.name, moveFileTool.description, moveFileTool.inputSchema, moveFileTool.handler);
}

if (isToolEnabled('copy-file')) {
  const copyFileTool = createCopyFileTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(copyFileTool.name, copyFileTool.description, copyFileTool.inputSchema, copyFileTool.handler);
}

if (isToolEnabled('generate-signed-url')) {
  const generateSignedUrlTool = createGenerateSignedUrlTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(generateSignedUrlTool.name, generateSignedUrlTool.description, generateSignedUrlTool.inputSchema, generateSignedUrlTool.handler);
}

if (isToolEnabled('get-file-info')) {
  const getFileInfoTool = createGetFileInfoTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(getFileInfoTool.name, getFileInfoTool.description, getFileInfoTool.inputSchema, getFileInfoTool.handler);
}

if (isToolEnabled('list-buckets')) {
  const listBucketsTool = createListBucketsTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(listBucketsTool.name, listBucketsTool.description, listBucketsTool.inputSchema, listBucketsTool.handler);
}

if (isToolEnabled('empty-bucket')) {
  const emptyBucketTool = createEmptyBucketTool(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  server.tool(emptyBucketTool.name, emptyBucketTool.description, emptyBucketTool.inputSchema, emptyBucketTool.handler);
}

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    const toolCount = ENABLED_TOOLS.length === 0 ? 'all' : ENABLED_TOOLS.length;
    console.error(`Supabase MCP Server running with ${toolCount} tools enabled`);
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

main().catch(console.error);