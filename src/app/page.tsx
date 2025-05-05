'use client';

import type {ChangeEvent, FormEvent} from 'react';
import {useState, useEffect, useRef} from 'react'; // Added useRef
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {ScrollArea} from '@/components/ui/scroll-area';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {Loader2, Upload, Download, FileText, AlertCircle, RotateCcw} from 'lucide-react'; // Added RotateCcw
import {generateDocument} from '@/actions/generateDocument';
import PizZip from 'pizzip'; // Keep PizZip for initial loading
import Docxtemplater from 'docxtemplater'; // Import Docxtemplater

// Define InspectModule interface (based on docxtemplater documentation)
interface InspectModuleType {
    tags: Record<string, unknown>;
    inspect: {
        tags: Record<string, unknown>;
        lexed: unknown;
        parsed: unknown;
        postparsed: unknown;
    };
    fullInspected: {
        tags: Record<string, unknown>;
        lexed: unknown;
        parsed: unknown;
        postparsed: unknown;
    };
    getTags(fileType: string): Record<string, unknown>;
    getAllTags(): Record<string, unknown>;
    nullGetter(part: any, scope: any, context?: any): undefined; // Made context optional as per fix
    // Add other methods/properties if needed based on actual usage
}

// Custom module for inspecting tags reliably
class InspectModule implements InspectModuleType {
  public tags: Record<string, unknown> = {};
  public inspect: any = { tags: {} }; // Simplified for this use case
  public fullInspected: any = { tags: {} }; // Simplified
  public name: string; // Add name property

  constructor() {
    this.tags = {};
    // Required properties/methods for a docxtemplater module
    this.name = "InspectModule";
  }

  // Called by docxtemplater with the parser instance
  set(obj: any) {
    if (obj.inspect) {
      this.inspect = obj.inspect;
    }
     if (obj.fullInspected) {
      this.fullInspected = obj.fullInspected;
    }
  }

  // Method called by docxtemplater during parsing/rendering
   parse(placeHolderContent: string) {
       // Basic filter to avoid XML tags
       if (placeHolderContent && !placeHolderContent.startsWith('<') && !placeHolderContent.endsWith('>')) {
            this.tags[placeHolderContent] = true; // Record the tag found
       }
       return {type: "placeholder", value: placeHolderContent};
   }

   // Required nullGetter for modules
    nullGetter(part: any, scope: any, context?: any): undefined { // Make context optional
        // This module doesn't change rendering, just inspects
         if (!context) {
             return undefined;
         }
         const resolved = context.scopePathItem;
          // Fix: Check if resolved is defined before accessing length
          if (!resolved || context.scopePathLength >= resolved.length) {
             return undefined;
         }
         const value = resolved[context.scopePathLength];
         return value;
    }


  // Public method to retrieve all found tags
  getAllTags(): Record<string, unknown> {
    // The inspection happens during render/resolve, so check the collected tags
    // The `inspect` object might hold more structured info after render,
    // but simply collecting during parse seems sufficient here.
     // Filter out any keys that look like XML/internal docx tags
     const filteredTags: Record<string, unknown> = {};
     const potentialTags = this.inspect.tags || this.tags;
     for (const key in potentialTags) {
         if (Object.prototype.hasOwnProperty.call(potentialTags, key)) {
             // Simple filter: exclude if it contains '<', '/', or ':' which are common in XML artifacts
              if (!key.includes('<') && !key.includes('/') && !key.includes(':')) {
                 filteredTags[key] = potentialTags[key];
             }
         }
     }
     return filteredTags;
  }

   // Additional required methods/properties for a basic module
    optionsTransformer(options: any, docxtemplater: any) {
        // No options transformation needed for inspection
        return options;
    }
    preparse(content: string, options: any) { return content;}
    postparse(postparsed: any, options: any) { return postparsed; }
    render(part: any, options: any) { /* no custom rendering */}
    postrender(parts: any, options: any) { return parts; }
    errorsTransformer(errors: any[]) { return errors; }
    getNearestParagraph(options: any) { /* Optional */}
    getStructuredTags(fileType: string) { return this.inspect.tags;} // Alias
    getFileType() { return "docx"; } // Assume docx
    matchers(): any[] { return []; } // No custom matchers needed


}


export default function Home() {
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [generatedFileName, setGeneratedFileName] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null); // Ref for file input

  // Avoid hydration mismatch for generated file name
  useEffect(() => {
      if (templateFile) {
          setGeneratedFileName(`generated_${templateFile.name}`);
      } else {
          setGeneratedFileName('generated_document.docx');
      }
  }, [templateFile]);


  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        setError('Invalid file type. Please upload a .docx file.');
        setTemplateFile(null);
        setPlaceholders([]);
        setFormData({});
        setFileName('');
        setGeneratedBlob(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      setTemplateFile(file);
      setFileName(file.name);
      setGeneratedBlob(null); // Reset generated blob

      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result;
        if (content instanceof ArrayBuffer) {
            try {
                const zip = new PizZip(content);
                const iModule = new InspectModule();

                 // Initialize Docxtemplater with the inspection module
                const doc = new Docxtemplater(zip, {
                     modules: [iModule],
                     // Use the custom nullGetter from the module to avoid errors on missing tags during inspection
                     nullGetter: (part, scopeManager) => iModule.nullGetter(part, scopeManager), // Removed undefined context pass
                      // Important: Prevent errors if placeholders are not resolvable during inspection
                     parser: (tag) => {
                       return {
                         get(scope: any, context: any) {
                             // Log the tag being parsed by the module
                             iModule.parse(tag);
                             // Return undefined for inspection phase to avoid "property not found" errors
                             return undefined;
                         },
                       };
                     },
                     paragraphLoop: true,
                     linebreaks: true,
                });


                // Perform a dry-run render to trigger the inspection module
                // We don't need actual data here, just need the parser to run.
                // Providing an empty object ensures it doesn't crash on missing data.
                 try {
                    doc.render({}); // This triggers the module's parse/get methods
                 } catch (renderError: any) {
                    // Errors during inspection render are usually template syntax issues
                    console.warn("Inspection render caught an error (likely template syntax):", renderError);
                     // Check for specific docxtemplater compilation errors
                     if (renderError.properties && renderError.properties.id === 'compile_error') {
                         setError(`Template Compilation Error: ${renderError.properties.explanation || renderError.message}. Please check the template syntax.`);
                     } else if (renderError.properties && renderError.properties.id === 'template_error') {
                          setError(`Template Syntax Error: ${renderError.message}. Check placeholder formatting.`);
                     }
                     else {
                        // Don't throw a fatal error here, but maybe log it
                        console.error('Unexpected error during template inspection:', renderError);
                        // Optionally, set a less severe error or warning
                        // setError("Could not fully inspect template placeholders due to an internal issue.");
                     }
                     // Allow continuing to show potentially extracted tags if any were found before error
                 }


                // Get the tags collected by the inspection module
                const tags = iModule.getAllTags();
                const uniquePlaceholders = Object.keys(tags);

                setPlaceholders(uniquePlaceholders);

                // Initialize form data
                const initialFormData: Record<string, string> = {};
                uniquePlaceholders.forEach((ph) => {
                  initialFormData[ph] = '';
                });
                setFormData(initialFormData);

            } catch (err: any) {
              console.error('Error processing DOCX file:', err);
               // Check for specific docxtemplater compilation errors that happen before render
               if (err.properties && err.properties.id === 'compile_error') {
                   setError(`Template Compilation Error: ${err.properties.explanation || err.message}. Please check the template syntax near '${err.properties.postparsed?.[err.properties.offset]?.value || 'unknown tag'}'.`);
               } else if (err.message && err.message.includes("Corrupted zip")) {
                   setError("Failed to read the template file. It might be corrupted or not a valid .docx file.");
               } else {
                   setError(`Failed to process template: ${err.message || 'Unknown error'}. Ensure it's a valid .docx file.`);
               }
              handleResetInternal(); // Use internal reset to clear state on error
            } finally {
              setIsLoading(false);
            }
        } else {
             setError('Failed to read the file content.');
             setIsLoading(false);
        }
      };
      reader.onerror = () => {
        setError('Failed to read the file.');
        setIsLoading(false);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const {name, value} = event.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  // Internal reset logic without resetting file input
  const handleResetInternal = () => {
      setTemplateFile(null);
      setPlaceholders([]);
      setFormData({});
      setError(null);
      setFileName('');
      setGeneratedBlob(null);
      setGeneratedFileName('generated_document.docx');
      setIsLoading(false);
      setIsProcessing(false);
  }

  // Reset handler for the button
   const handleReset = () => {
       handleResetInternal();
       // Reset the file input value
       if (fileInputRef.current) {
         fileInputRef.current.value = '';
       }
   };


  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!templateFile) {
      setError('Please upload a template file first.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setGeneratedBlob(null); // Clear previous blob

    try {
      const fileBuffer = await templateFile.arrayBuffer();
      const result = await generateDocument(fileBuffer, formData);

      if (result.success && result.blob) {
        setGeneratedBlob(result.blob);
         if (templateFile) {
             setGeneratedFileName(`generated_${templateFile.name}`);
         }

      } else {
        setError(result.error || 'Failed to generate the document.');
        setGeneratedBlob(null); // Ensure blob is null on error
      }
    } catch (err) {
      console.error('Error generating document:', err);
      setError('An unexpected error occurred during document generation.');
      setGeneratedBlob(null); // Ensure blob is null on error
    } finally {
      setIsProcessing(false);
    }
  };

   const handleDownload = () => {
       if (generatedBlob && generatedFileName) {
           const url = window.URL.createObjectURL(generatedBlob);
           const a = document.createElement('a');
           a.href = url;
           a.download = generatedFileName;
           document.body.appendChild(a);
           a.click();
           window.URL.revokeObjectURL(url);
           a.remove();
       }
   };


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 md:p-8">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center text-primary flex items-center justify-center gap-2">
            <FileText className="w-8 h-8 text-accent-foreground" /> DocuMint
          </CardTitle>
          <CardDescription className="text-center text-muted-foreground pt-2">
            Upload your .docx template, fill in the placeholder values, and generate your document.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

           {/* File Upload & Reset Section */}
            <div className="space-y-2">
              <Label htmlFor="template-upload" className="text-lg font-medium">
                1. Upload Template (.docx)
              </Label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                 <Input
                   ref={fileInputRef} // Assign ref
                   id="template-upload"
                   type="file"
                   accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                   onChange={handleFileChange}
                   className="hidden"
                   disabled={isLoading || isProcessing}
                 />
                 <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()} // Use ref to trigger click
                    disabled={isLoading || isProcessing}
                    className="flex-shrink-0 w-full sm:w-auto"
                 >
                   <Upload className="mr-2 h-4 w-4" />
                   {fileName ? 'Change File' : 'Choose File'}
                 </Button>
                 {fileName && (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm text-muted-foreground truncate" title={fileName}>{fileName}</span>
                      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-secondary-foreground" />}
                    </div>
                  )}
                   {/* Reset Button */}
                   {(templateFile || fileName || placeholders.length > 0 || Object.keys(formData).some(k => formData[k]) || error) && ( // Show reset if there's a file, name, placeholders, filled data, or an error
                     <Button
                         variant="ghost"
                         size="icon"
                         onClick={handleReset}
                         disabled={isLoading || isProcessing}
                         className="text-muted-foreground hover:text-destructive flex-shrink-0"
                         aria-label="Reset form"
                       >
                         <RotateCcw className="h-5 w-5" />
                       </Button>
                   )}
              </div>
              <p className="text-xs text-muted-foreground">Placeholders should be in the format {'{placeholder_name}'}.</p>
            </div>

          {/* Placeholder Input Section */}
          {placeholders.length > 0 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Label className="text-lg font-medium">2. Fill Placeholder Values</Label>
              <ScrollArea className="h-64 w-full rounded-md border p-4 bg-secondary/30">
                <div className="space-y-4">
                  {placeholders.map((placeholder) => (
                    <div key={placeholder} className="space-y-1">
                      <Label htmlFor={placeholder} className="text-sm font-medium text-foreground">
                        {placeholder}
                      </Label>
                      <Input
                        id={placeholder}
                        name={placeholder}
                        value={formData[placeholder] || ''}
                        onChange={handleInputChange}
                        placeholder={`Enter value for {${placeholder}}`}
                        className="bg-card"
                        disabled={isProcessing}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>

               {/* Generate Button */}
                <Button
                    type="submit"
                    disabled={isProcessing || isLoading || !templateFile || placeholders.length === 0}
                    className="w-full btn-teal"
                  >
                    {isProcessing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="mr-2 h-4 w-4" />
                    )}
                    Generate Document
                  </Button>

            </form>
          )}

          {/* Download Section */}
          {generatedBlob && !error && ( // Only show download if blob exists AND there's no current error
            <div className="space-y-2 pt-4 border-t">
                 <Label className="text-lg font-medium">3. Download Your Document</Label>
                 <p className="text-sm text-muted-foreground">Your document '{generatedFileName}' is ready.</p>
                 <Button onClick={handleDownload} className="w-full btn-teal-outline">
                   <Download className="mr-2 h-4 w-4" />
                   Download Document
                 </Button>
            </div>
          )}

        </CardContent>
         <CardFooter className="text-center text-xs text-muted-foreground justify-center">
            Powered by DocuMint
         </CardFooter>
      </Card>
    </div>
  );
}
