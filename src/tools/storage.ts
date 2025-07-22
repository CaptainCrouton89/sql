import { z } from "zod";
import { createSuccessResponse, createErrorResponse } from "../utils/response.js";

export function createUploadFileTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "upload-file",
    description: "Upload a file to Supabase Storage",
    inputSchema: {
      bucketName: z.string().describe("The name of the storage bucket"),
      filePath: z.string().describe("The file path within the bucket"),
      fileContent: z.string().describe("Base64 encoded file content"),
      contentType: z
        .string()
        .optional()
        .describe("MIME type of the file (e.g., 'image/png')"),
      cacheControl: z.string().optional().describe("Cache control header"),
      upsert: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to overwrite existing file"),
    },
    handler: async ({
      bucketName,
      filePath,
      fileContent,
      contentType,
      cacheControl,
      upsert,
    }: {
      bucketName: string;
      filePath: string;
      fileContent: string;
      contentType?: string;
      cacheControl?: string;
      upsert?: boolean;
    }) => {
      try {
        const buffer = Buffer.from(fileContent, "base64");

        const headers: Record<string, string> = {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": contentType || "application/octet-stream",
        };

        if (cacheControl) {
          headers["Cache-Control"] = cacheControl;
        }

        const url = `${supabaseUrl}/storage/v1/object/${bucketName}/${filePath}`;
        const method = upsert ? "PUT" : "POST";

        const response = await fetch(url, {
          method,
          headers,
          body: buffer,
        });

        const result = await response.json();

        if (!response.ok) {
          return createErrorResponse({
            status: response.status,
            message: result.message || result.error || "Upload failed",
          });
        }

        return createSuccessResponse({
          success: true,
          bucketName,
          filePath,
          size: buffer.length,
          contentType,
          ...result,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createDeleteFileTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "delete-file",
    description: "Delete a file from Supabase Storage",
    inputSchema: {
      bucketName: z.string().describe("The name of the storage bucket"),
      filePath: z.string().describe("The file path within the bucket"),
    },
    handler: async ({
      bucketName,
      filePath,
    }: {
      bucketName: string;
      filePath: string;
    }) => {
      try {
        const url = `${supabaseUrl}/storage/v1/object/${bucketName}/${filePath}`;

        const response = await fetch(url, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
          },
        });

        if (!response.ok) {
          const result = await response.json();
          return createErrorResponse({
            status: response.status,
            message: result.message || result.error || "Delete failed",
          });
        }

        return createSuccessResponse({
          success: true,
          message: `File deleted: ${bucketName}/${filePath}`,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createListFilesTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "list-files",
    description: "List files in a Supabase Storage bucket",
    inputSchema: {
      bucketName: z.string().describe("The name of the storage bucket"),
      path: z
        .string()
        .optional()
        .default("")
        .describe("The folder path to list files from"),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of files to return"),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe("Number of files to skip"),
    },
    handler: async ({
      bucketName,
      path,
      limit,
      offset,
    }: {
      bucketName: string;
      path?: string;
      limit?: number;
      offset?: number;
    }) => {
      try {
        const url = `${supabaseUrl}/storage/v1/object/list/${bucketName}`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prefix: path,
            limit,
            offset,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          return createErrorResponse({
            status: response.status,
            message: result.message || result.error || "List failed",
          });
        }

        return createSuccessResponse({
          bucketName,
          path,
          files: result,
          count: result.length,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createDownloadFileTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "download-file",
    description: "Download a file from Supabase Storage",
    inputSchema: {
      bucketName: z.string().describe("The name of the storage bucket"),
      filePath: z.string().describe("The file path within the bucket"),
      asBase64: z
        .boolean()
        .optional()
        .default(true)
        .describe("Return file content as base64"),
    },
    handler: async ({
      bucketName,
      filePath,
      asBase64,
    }: {
      bucketName: string;
      filePath: string;
      asBase64?: boolean;
    }) => {
      try {
        const url = `${supabaseUrl}/storage/v1/object/${bucketName}/${filePath}`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
          },
        });

        if (!response.ok) {
          const result = await response.text();
          return createErrorResponse({
            status: response.status,
            message: result || "Download failed",
          });
        }

        const buffer = await response.arrayBuffer();
        const contentType =
          response.headers.get("content-type") || "application/octet-stream";
        const contentLength = response.headers.get("content-length");

        return createSuccessResponse({
          success: true,
          bucketName,
          filePath,
          contentType,
          size: contentLength
            ? parseInt(contentLength)
            : buffer.byteLength,
          content: asBase64
            ? Buffer.from(buffer).toString("base64")
            : "[Binary data]",
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createCreateBucketTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "create-bucket",
    description: "Create a new storage bucket",
    inputSchema: {
      name: z.string().describe("The name of the bucket to create"),
      isPublic: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether the bucket should be public"),
      fileSizeLimit: z
        .number()
        .optional()
        .describe("Maximum file size allowed in bytes"),
      allowedMimeTypes: z
        .array(z.string())
        .optional()
        .describe("List of allowed MIME types"),
    },
    handler: async ({
      name,
      isPublic,
      fileSizeLimit,
      allowedMimeTypes,
    }: {
      name: string;
      isPublic?: boolean;
      fileSizeLimit?: number;
      allowedMimeTypes?: string[];
    }) => {
      try {
        const url = `${supabaseUrl}/storage/v1/bucket`;

        const body: any = {
          name,
          public: isPublic,
        };

        if (fileSizeLimit) {
          body.file_size_limit = fileSizeLimit;
        }

        if (allowedMimeTypes) {
          body.allowed_mime_types = allowedMimeTypes;
        }

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        const result = await response.json();

        if (!response.ok) {
          return createErrorResponse({
            status: response.status,
            message:
              result.message || result.error || "Bucket creation failed",
          });
        }

        return createSuccessResponse({
          success: true,
          bucket: result,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createDeleteBucketTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "delete-bucket",
    description: "Delete a storage bucket",
    inputSchema: {
      bucketName: z.string().describe("The name of the bucket to delete"),
    },
    handler: async ({ bucketName }: { bucketName: string }) => {
      try {
        const url = `${supabaseUrl}/storage/v1/bucket/${bucketName}`;

        const response = await fetch(url, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
          },
        });

        if (!response.ok) {
          const result = await response.json();
          return createErrorResponse({
            status: response.status,
            message:
              result.message || result.error || "Bucket deletion failed",
          });
        }

        return createSuccessResponse({
          success: true,
          message: `Bucket deleted: ${bucketName}`,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createMoveFileTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "move-file",
    description: "Move or rename a file in Supabase Storage",
    inputSchema: {
      fromBucket: z.string().describe("The source bucket name"),
      fromPath: z.string().describe("The source file path"),
      toBucket: z.string().describe("The destination bucket name"),
      toPath: z.string().describe("The destination file path"),
    },
    handler: async ({
      fromBucket,
      fromPath,
      toBucket,
      toPath,
    }: {
      fromBucket: string;
      fromPath: string;
      toBucket: string;
      toPath: string;
    }) => {
      try {
        const url = `${supabaseUrl}/storage/v1/object/move`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bucketId: fromBucket,
            sourceKey: fromPath,
            destinationKey: toPath,
            destinationBucket: toBucket,
          }),
        });

        if (!response.ok) {
          const result = await response.json();
          return createErrorResponse({
            status: response.status,
            message: result.message || result.error || "Move failed",
          });
        }

        const result = await response.json();

        return createSuccessResponse({
          success: true,
          message: `File moved from ${fromBucket}/${fromPath} to ${toBucket}/${toPath}`,
          ...result,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createCopyFileTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "copy-file",
    description: "Copy a file in Supabase Storage",
    inputSchema: {
      fromBucket: z.string().describe("The source bucket name"),
      fromPath: z.string().describe("The source file path"),
      toBucket: z.string().describe("The destination bucket name"),
      toPath: z.string().describe("The destination file path"),
    },
    handler: async ({
      fromBucket,
      fromPath,
      toBucket,
      toPath,
    }: {
      fromBucket: string;
      fromPath: string;
      toBucket: string;
      toPath: string;
    }) => {
      try {
        const url = `${supabaseUrl}/storage/v1/object/copy`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bucketId: fromBucket,
            sourceKey: fromPath,
            destinationKey: toPath,
            destinationBucket: toBucket,
          }),
        });

        if (!response.ok) {
          const result = await response.json();
          return createErrorResponse({
            status: response.status,
            message: result.message || result.error || "Copy failed",
          });
        }

        const result = await response.json();

        return createSuccessResponse({
          success: true,
          message: `File copied from ${fromBucket}/${fromPath} to ${toBucket}/${toPath}`,
          ...result,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createGenerateSignedUrlTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "generate-signed-url",
    description: "Generate a presigned URL for file access",
    inputSchema: {
      bucketName: z.string().describe("The bucket name"),
      filePath: z.string().describe("The file path"),
      expiresIn: z
        .number()
        .optional()
        .default(3600)
        .describe("URL expiration time in seconds"),
      operation: z
        .enum(["download", "upload"])
        .default("download")
        .describe("Type of signed URL"),
    },
    handler: async ({
      bucketName,
      filePath,
      expiresIn,
      operation,
    }: {
      bucketName: string;
      filePath: string;
      expiresIn?: number;
      operation?: "download" | "upload";
    }) => {
      try {
        const endpoint = operation === "upload" ? "upload/sign" : "sign";
        const url = `${supabaseUrl}/storage/v1/object/${endpoint}/${bucketName}/${filePath}`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            expiresIn,
          }),
        });

        if (!response.ok) {
          const result = await response.json();
          return createErrorResponse({
            status: response.status,
            message:
              result.message ||
              result.error ||
              "Signed URL generation failed",
          });
        }

        const result = await response.json();

        return createSuccessResponse({
          success: true,
          bucketName,
          filePath,
          operation,
          expiresIn,
          signedURL: result.signedURL || result.url,
          ...result,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createGetFileInfoTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "get-file-info",
    description: "Get file metadata and information",
    inputSchema: {
      bucketName: z.string().describe("The bucket name"),
      filePath: z.string().describe("The file path"),
      authenticated: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether to use authenticated endpoint"),
    },
    handler: async ({
      bucketName,
      filePath,
      authenticated,
    }: {
      bucketName: string;
      filePath: string;
      authenticated?: boolean;
    }) => {
      try {
        const endpoint = authenticated ? "info/authenticated" : "info";
        const url = `${supabaseUrl}/storage/v1/object/${endpoint}/${bucketName}/${filePath}`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
          },
        });

        if (!response.ok) {
          const result = await response.text();
          return createErrorResponse({
            status: response.status,
            message: result || "File info retrieval failed",
          });
        }

        const result = await response.json();

        return createSuccessResponse({
          success: true,
          bucketName,
          filePath,
          fileInfo: result,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createListBucketsTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "list-buckets",
    description: "List all storage buckets",
    inputSchema: {
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of buckets to return"),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe("Number of buckets to skip"),
    },
    handler: async ({
      limit,
      offset,
    }: {
      limit?: number;
      offset?: number;
    }) => {
      try {
        const url = `${supabaseUrl}/storage/v1/bucket?limit=${limit}&offset=${offset}`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
          },
        });

        if (!response.ok) {
          const result = await response.json();
          return createErrorResponse({
            status: response.status,
            message:
              result.message || result.error || "List buckets failed",
          });
        }

        const result = await response.json();

        return createSuccessResponse({
          success: true,
          buckets: result,
          count: result.length,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}

export function createEmptyBucketTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "empty-bucket",
    description: "Empty all contents from a storage bucket",
    inputSchema: {
      bucketName: z.string().describe("The name of the bucket to empty"),
    },
    handler: async ({ bucketName }: { bucketName: string }) => {
      try {
        const url = `${supabaseUrl}/storage/v1/bucket/${bucketName}/empty`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
          },
        });

        if (!response.ok) {
          const result = await response.json();
          return createErrorResponse({
            status: response.status,
            message:
              result.message || result.error || "Empty bucket failed",
          });
        }

        const result = await response.json();

        return createSuccessResponse({
          success: true,
          message: `Bucket ${bucketName} has been emptied`,
          ...result,
        });
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}