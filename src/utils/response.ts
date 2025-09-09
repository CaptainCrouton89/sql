function removeNullFields(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(removeNullFields);
  }
  
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        result[key] = removeNullFields(value);
      }
    }
    return result;
  }
  
  return obj;
}

export function createSuccessResponse(data: any) {
  const cleanedData = removeNullFields(data);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(cleanedData, null, 2),
      },
    ],
  };
}

export function createMarkdownResponse(markdown: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: markdown,
      },
    ],
  };
}

export function createErrorResponse(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
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
}

export function createGuidedErrorResponse(error: unknown, guidance?: string) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  let markdown = `## ❌ Query Error\n\n`;
  markdown += `**Error**: ${errorMessage}\n\n`;
  
  if (guidance) {
    markdown += guidance;
  }
  
  return createMarkdownResponse(markdown);
}