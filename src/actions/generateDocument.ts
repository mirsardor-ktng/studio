"use server";

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

interface GenerationResult {
  success: boolean;
  blob?: Blob;
  error?: string;
}

// Function to handle potential errors during template processing
function handleErrors(errors: any[]) {
    if (errors.length > 0) {
        let message = "Template Error(s):\n";
        errors.forEach(error => {
            message += `  - ${error.message} (Property: ${error.properties.id})\n`;
            if (error.properties.explanation) {
                 message += `    Explanation: ${error.properties.explanation}\n`;
            }
        });
        console.error(message); // Log detailed error on the server
        // Provide a more user-friendly error message
        const userFriendlyErrors = errors.map(e => {
             if (e.id === 'multi_error') {
                 return handleErrors(e.properties.errors).error; // Recursively handle multi-errors
             }
             if (e.id === 'template_error' && e.properties?.id === 'scope_parser_error') {
                 return `Syntax error in placeholder "${e.properties.tag}". Check for typos or incorrect formatting.`;
             }
             if (e.id === 'template_error' && e.properties?.id === 'unopened_tag') {
                 return `Closing tag "${e.properties.tag}" found without a matching opening tag. Check template structure.`;
             }
             if (e.id === 'template_error' && e.properties?.id === 'unclosed_tag') {
                 return `Opening tag "${e.properties.tag}" found without a matching closing tag. Check template structure.`;
             }
              if (e.id === 'render_error') {
                 return `Error rendering placeholder "${e.properties.id}". Ensure the provided data is correct.`;
             }
             // Generic fallback
             return `Error processing placeholder "${e.properties.id || 'unknown'}". Details: ${e.message}`;

        }).filter(msg => msg).join('\n'); // Filter out potential undefined results from recursion
        return { error: `Failed to process template due to:\n${userFriendlyErrors}` };
    }
    return { error: null };
}


export async function generateDocument(
  templateArrayBuffer: ArrayBuffer,
  data: Record<string, string>
): Promise<GenerationResult> {
  try {
    const zip = new PizZip(templateArrayBuffer);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Custom error handler
       errorLogging: false, // Disable default console logging if using custom handler
       parser: (tag) => {
           return {
               get(scope) {
                   if (tag === '.') {
                       return scope;
                   }
                   if (scope.hasOwnProperty(tag)) {
                       return scope[tag];
                   }
                   // Indicate missing data without throwing a hard error initially
                   // Return a specific marker or undefined. Let the rendering handle it.
                    console.warn(`Placeholder {${tag}} not found in provided data.`);
                    // Optionally return a default value or marker:
                    // return `[MISSING: ${tag}]`;
                   return undefined; // Standard behavior: evaluate to undefined
               },
           };
       },
    });

    // Perform the substitution
    doc.setData(data);

    try {
        // Render the document (replace all occurences of {placeholder} by data.placeholder)
        doc.render();
    } catch (error: any) {
         console.error("Docxtemplater render error:", JSON.stringify(error, null, 2));

         // Check if the error is from docxtemplater's structured errors
        if (error.properties && error.properties.errors && Array.isArray(error.properties.errors)) {
             const errorHandlingResult = handleErrors(error.properties.errors);
             if (errorHandlingResult.error) {
                 return { success: false, error: errorHandlingResult.error };
             }
         }
         // Fallback for other types of errors during render
          return { success: false, error: `Rendering failed: ${error.message || 'Unknown error'}. Check template syntax and provided data.` };
    }


    // Generate the output file
    const out = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    // Create a Blob from the generated buffer
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    return { success: true, blob };
  } catch (error: any) {
     console.error("Error in generateDocument:", error);
     // Handle zip errors specifically
      if (error.message && error.message.includes("Corrupted zip")) {
          return { success: false, error: "Failed to read the template file. It might be corrupted or not a valid .docx file." };
      }
      // Generic error for other issues
     return { success: false, error: `An unexpected error occurred: ${error.message || 'Unknown error'}` };
  }
}
