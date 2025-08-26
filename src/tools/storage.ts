import { z } from "zod";
import fs from "fs";
import path from "path";
import { createErrorResponse, createMarkdownResponse } from "../utils/response.js";

export function createUploadFileTool(supabaseUrl: string, serviceKey: string) {
  return {
    name: "upload-file",
    description: "Upload a file to Supabase Storage",
    inputSchema: {
      bucketName: z.string().describe("The name of the storage bucket"),
      filePath: z.string().describe("The file path within the bucket"),
      fileContent: z.string().optional().describe("Base64 encoded file content"),
      localFilePath: z.string().optional().describe("Local file path to upload (alternative to fileContent)"),
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
      localFilePath,
      contentType,
      cacheControl,
      upsert,
    }: {
      bucketName: string;
      filePath: string;
      fileContent?: string;
      localFilePath?: string;
      contentType?: string;
      cacheControl?: string;
      upsert?: boolean;
    }) => {
      try {
        // Validate that exactly one of fileContent or localFilePath is provided
        if (!fileContent && !localFilePath) {
          return createErrorResponse({
            status: 400,
            message: "Either fileContent or localFilePath must be provided",
          });
        }
        
        if (fileContent && localFilePath) {
          return createErrorResponse({
            status: 400,
            message: "Cannot provide both fileContent and localFilePath",
          });
        }

        let buffer: Buffer;
        let detectedContentType: string | undefined;

        if (localFilePath) {
          // Read file from local path
          if (!fs.existsSync(localFilePath)) {
            return createErrorResponse({
              status: 404,
              message: `File not found: ${localFilePath}`,
            });
          }

          try {
            buffer = fs.readFileSync(localFilePath);
          } catch (error) {
            return createErrorResponse({
              status: 500,
              message: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
          }

          // Auto-detect content type if not provided
          if (!contentType) {
            const ext = path.extname(localFilePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.png': 'image/png',
              '.gif': 'image/gif',
              '.webp': 'image/webp',
              '.svg': 'image/svg+xml',
              '.pdf': 'application/pdf',
              '.txt': 'text/plain',
              '.html': 'text/html',
              '.css': 'text/css',
              '.js': 'application/javascript',
              '.json': 'application/json',
              '.xml': 'application/xml',
              '.zip': 'application/zip',
            };
            detectedContentType = mimeTypes[ext];
          }
        } else {
          // Use provided base64 content
          buffer = Buffer.from(fileContent!, "base64");
        }

        const headers: Record<string, string> = {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": contentType || detectedContentType || "application/octet-stream",
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

        // Format as markdown
        let markdown = `### File Uploaded\n\n`;
        markdown += `| Property | Value |\n`;
        markdown += `|----------|-------|\n`;
        markdown += `| Bucket | ${bucketName} |\n`;
        markdown += `| Path | ${filePath} |\n`;
        markdown += `| Size | ${buffer.length.toLocaleString()} bytes |\n`;
        markdown += `| Type | ${contentType || detectedContentType || 'application/octet-stream'} |\n`;
        markdown += `| Source | ${localFilePath ? `Local file: ${localFilePath}` : 'Base64 content'} |\n`;
        
        if (result.Id) {
          markdown += `| ID | ${result.Id} |\n`;
        }
        
        markdown += `\n*File uploaded successfully*`;
        
        return createMarkdownResponse(markdown);
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

        return createMarkdownResponse(`### File Deleted\n\n✅ Successfully deleted: **${bucketName}/${filePath}**`);
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

        // Format as markdown
        let markdown = `### Files in ${bucketName}${path ? `/${path}` : ''}\n\n`;
        
        if (!result || result.length === 0) {
          markdown += `*No files found*`;
        } else {
          markdown += `| Name | Size | Updated | Type |\n`;
          markdown += `|------|------|---------|------|\n`;
          
          for (const file of result) {
            const name = file.name || 'Unknown';
            const size = file.metadata?.size ? `${file.metadata.size.toLocaleString()} bytes` : '-';
            const updated = file.updated_at ? new Date(file.updated_at).toLocaleDateString() : '-';
            const type = file.metadata?.mimetype || '-';
            
            markdown += `| ${name} | ${size} | ${updated} | ${type} |\n`;
          }
          
          markdown += `\n*${result.length} file(s) found*`;
        }
        
        return createMarkdownResponse(markdown);
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

        // Format as markdown
        let markdown = `### File Downloaded\n\n`;
        markdown += `| Property | Value |\n`;
        markdown += `|----------|-------|\n`;
        markdown += `| Bucket | ${bucketName} |\n`;
        markdown += `| Path | ${filePath} |\n`;
        markdown += `| Type | ${contentType} |\n`;
        markdown += `| Size | ${(contentLength ? parseInt(contentLength) : buffer.byteLength).toLocaleString()} bytes |\n`;
        
        if (asBase64) {
          markdown += `\n#### Content (Base64)\n`;
          markdown += `\`\`\`\n`;
          markdown += Buffer.from(buffer).toString("base64").substring(0, 1000);
          if (Buffer.from(buffer).toString("base64").length > 1000) {
            markdown += `...\n[Truncated - ${Buffer.from(buffer).toString("base64").length - 1000} more characters]`;
          }
          markdown += `\n\`\`\`\n`;
        } else {
          markdown += `\n*Binary data downloaded (not displayed)*`;
        }
        
        return createMarkdownResponse(markdown);
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

        // Format as markdown
        let markdown = `### Bucket Created\n\n`;
        markdown += `✅ Successfully created bucket: **${name}**\n\n`;
        markdown += `| Property | Value |\n`;
        markdown += `|----------|-------|\n`;
        markdown += `| Public | ${isPublic ? 'Yes' : 'No'} |\n`;
        
        if (fileSizeLimit) {
          markdown += `| Max File Size | ${fileSizeLimit.toLocaleString()} bytes |\n`;
        }
        
        if (allowedMimeTypes && allowedMimeTypes.length > 0) {
          markdown += `| Allowed Types | ${allowedMimeTypes.join(', ')} |\n`;
        }
        
        return createMarkdownResponse(markdown);
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

        return createMarkdownResponse(`### Bucket Deleted\n\n✅ Successfully deleted bucket: **${bucketName}**`);
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

        await response.json(); // Consume response body

        return createMarkdownResponse(`### File Moved\n\n✅ Successfully moved file:\n- **From**: ${fromBucket}/${fromPath}\n- **To**: ${toBucket}/${toPath}`);
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

        await response.json(); // Consume response body

        return createMarkdownResponse(`### File Copied\n\n✅ Successfully copied file:\n- **From**: ${fromBucket}/${fromPath}\n- **To**: ${toBucket}/${toPath}`);
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

        // Format as markdown
        let markdown = `### Signed URL Generated\n\n`;
        markdown += `| Property | Value |\n`;
        markdown += `|----------|-------|\n`;
        markdown += `| Bucket | ${bucketName} |\n`;
        markdown += `| Path | ${filePath} |\n`;
        markdown += `| Operation | ${operation} |\n`;
        markdown += `| Expires In | ${expiresIn} seconds |\n\n`;
        markdown += `**Signed URL**:\n\`\`\`\n${result.signedURL || result.url}\n\`\`\``;
        
        return createMarkdownResponse(markdown);
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

        // Format as markdown
        let markdown = `### File Information\n\n`;
        markdown += `| Property | Value |\n`;
        markdown += `|----------|-------|\n`;
        markdown += `| Bucket | ${bucketName} |\n`;
        markdown += `| Path | ${filePath} |\n`;
        
        if (result.size) {
          markdown += `| Size | ${result.size.toLocaleString()} bytes |\n`;
        }
        if (result.mimetype) {
          markdown += `| MIME Type | ${result.mimetype} |\n`;
        }
        if (result.lastModified) {
          markdown += `| Last Modified | ${new Date(result.lastModified).toLocaleString()} |\n`;
        }
        if (result.etag) {
          markdown += `| ETag | ${result.etag} |\n`;
        }
        
        return createMarkdownResponse(markdown);
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

        // Format as markdown
        let markdown = `### Storage Buckets\n\n`;
        
        if (!result || result.length === 0) {
          markdown += `*No buckets found*`;
        } else {
          markdown += `| Name | Public | Created | Updated |\n`;
          markdown += `|------|--------|---------|---------|\n`;
          
          for (const bucket of result) {
            const name = bucket.name || 'Unknown';
            const isPublic = bucket.public ? 'Yes' : 'No';
            const created = bucket.created_at ? new Date(bucket.created_at).toLocaleDateString() : '-';
            const updated = bucket.updated_at ? new Date(bucket.updated_at).toLocaleDateString() : '-';
            
            markdown += `| ${name} | ${isPublic} | ${created} | ${updated} |\n`;
          }
          
          markdown += `\n*${result.length} bucket(s) total*`;
        }
        
        return createMarkdownResponse(markdown);
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

        await response.json(); // Consume response body

        return createMarkdownResponse(`### Bucket Emptied\n\n✅ Successfully emptied bucket: **${bucketName}**\n\nAll files have been removed from the bucket.`);
      } catch (error) {
        return createErrorResponse(error);
      }
    },
  };
}