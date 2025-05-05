
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
import { numberToWords } from '@/lib/numberToWords'; // Import the helper
import { cn } from '@/lib/utils'; // Import cn for conditional classes

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
            // Further filter specific known non-placeholder patterns if needed
            if (!placeHolderContent.includes('</w:t>')) {
                this.tags[placeHolderContent] = true; // Record the tag found
            }
       }
       return {type: "placeholder", value: placeHolderContent};
   }

   // Required nullGetter for modules
    nullGetter(part: any, scope?: any, context?: any): undefined { // Make scope and context optional
        // This module doesn't change rendering, just inspects. Always return undefined during inspection.
        return undefined;
    }


  // Public method to retrieve all found tags
  getAllTags(): Record<string, unknown> {
     const filteredTags: Record<string, unknown> = {};
     // Prefer tags collected during parse as inspect.tags might contain resolved values
     const potentialTags = this.tags;
     for (const key in potentialTags) {
         if (Object.prototype.hasOwnProperty.call(potentialTags, key)) {
             // Filter out keys that are likely XML/internal tags or contain complex structures
             // Ensure it's a simple word possibly with underscores/numbers
              if (/^[a-zA-Z0-9_]+$/.test(key)) {
                 filteredTags[key] = potentialTags[key];
             }
         }
     }
     // Additional check on inspect.tags if the above yields nothing, applying same filter
      if (Object.keys(filteredTags).length === 0 && this.inspect.tags) {
          for (const key in this.inspect.tags) {
               if (Object.prototype.hasOwnProperty.call(this.inspect.tags, key)) {
                   if (/^[a-zA-Z0-9_]+$/.test(key)) {
                        filteredTags[key] = this.inspect.tags[key];
                   }
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

// Helper to format number as Uzbek Sum currency string
const formatCurrencyUzbekSum = (value: string | number | undefined): string => {
    if (value === undefined || value === null || value === '') return '';

    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : value;

    if (isNaN(num)) {
        return ''; // Return empty if not a valid number after cleaning
    }

    // Format with spaces as thousands separators, specific to Uzbek locale preference if possible
    // Using 'ru-RU' as a common locale that uses spaces. Adjust if a specific UZ locale is better.
    const formattedNumber = num.toLocaleString('ru-RU', {
        style: 'decimal', // Use 'decimal' to avoid automatic currency symbols
        maximumFractionDigits: 2, // Allow decimals if needed, though example is integer
        minimumFractionDigits: 0,
    });

    return `${formattedNumber} сум`;
};

// Helper to get raw numeric value from formatted string or number
const getRawNumericValue = (value: string | number | undefined): number | null => {
    if (value === undefined || value === null || value === '') return null;
    const cleanedString = typeof value === 'string' ? value.replace(/[^0-9.]/g, '') : String(value);
    const num = parseFloat(cleanedString);
    return isNaN(num) ? null : num;
};


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

                 // Initialize Docxtemplater ONLY with the module for inspection
                const doc = new Docxtemplater(zip, {
                     modules: [iModule], // Use the module
                     paragraphLoop: true,
                     linebreaks: true,
                     // REMOVE custom parser and nullGetter here, let the module handle it
                });


                // Try compiling first to catch syntax errors
                // This internally calls the module's parse method
                doc.compile();

                // Render with empty data just to ensure all parts are processed for tag collection
                // This might still fail on complex templates, but tags might be collected already.
                 try {
                    doc.render({}); // This triggers the module's get methods if not already done by compile
                 } catch (renderError: any) {
                     // Log benignly as render might fail without data, but compile() likely got the tags
                     console.warn("Inspection render encountered an error (might be ignorable if tags were found):", renderError.message);
                     // Check if it's a 'missing data' type error, which we expect here.
                     if (renderError.properties?.id !== 'render_error' && renderError.properties?.id !== 'scope_error') {
                        // If it's not a simple render/scope error, maybe re-throw or log more severely
                        console.error('Potentially problematic error during inspection render:', renderError);
                     }
                     // Continue anyway, hoping tags were collected during compile/parse phase
                 }


                // Get the tags collected by the inspection module
                const tags = iModule.getAllTags();
                const uniquePlaceholders = Object.keys(tags);

                // If no tags found and there was a render error, report template issue
                 if (uniquePlaceholders.length === 0 && error === null) { // Check if an error wasn't already set
                      // Check if a render error occurred previously
                      const renderErrorExists = typeof window !== 'undefined' && (window as any).__INSPECTION_RENDER_ERROR__; // Simple flag, adjust if needed
                       if (renderErrorExists) {
                          setError("Failed to parse template placeholders. Check template syntax or complexity.");
                          delete (window as any).__INSPECTION_RENDER_ERROR__; // Clean up flag
                       } else if (uniquePlaceholders.length === 0) {
                          setError("No placeholders found in the template. Ensure they are correctly formatted like {placeholder_name}.");
                       }
                 }

                setPlaceholders(uniquePlaceholders);

                // Initialize form data
                const initialFormData: Record<string, string> = {};
                 const currentFormData = { ...formData }; // Capture current state for pre-filling
                uniquePlaceholders.forEach((ph) => {
                  initialFormData[ph] = '';
                  // Pre-fill contract_am_words if contract_am exists (using captured state)
                   if (ph.endsWith('_words') && !ph.startsWith('contract_am')) { // Generalize for any amount field
                       const baseName = ph.replace('_words', '');
                       if (currentFormData[baseName]) {
                            const rawAmount = getRawNumericValue(currentFormData[baseName]);
                            initialFormData[ph] = rawAmount !== null ? numberToWords(rawAmount) : '';
                       }
                   }
                });
                setFormData(initialFormData);

            } catch (err: any) {
              console.error('Error processing DOCX file:', err);
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
       const isAmountField = name.includes('am') && !name.includes('words');

        setFormData((prevData) => {
            const newData = { ...prevData };

            if (isAmountField) {
                 // Keep raw numeric value or cleaned string in state for processing
                 const rawValue = value.replace(/[^0-9.]/g, ''); // Allow only numbers and dot
                 newData[name] = rawValue; // Store the cleaned numeric string

                 // Automatically update corresponding _words field
                 const wordsFieldName = `${name}_words`;
                 if (newData.hasOwnProperty(wordsFieldName)) {
                     const amount = parseFloat(rawValue);
                     if (!isNaN(amount)) {
                         newData[wordsFieldName] = numberToWords(amount);
                     } else {
                         newData[wordsFieldName] = ''; // Clear if input is not a valid number
                     }
                 }
            } else {
                 newData[name] = value; // Store other fields as is
            }


            return newData;
        });
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

        // Prepare data for docxtemplater, formatting amount fields
        const processedData: Record<string, string> = {};
        for (const key in formData) {
             if (key.includes('am') && !key.includes('words')) {
                 // Format amount fields for the document
                 processedData[key] = formatCurrencyUzbekSum(formData[key]);
             } else {
                 // Use other fields directly (including _words fields)
                 processedData[key] = formData[key];
             }
        }


        const result = await generateDocument(fileBuffer, processedData);

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
                (Umida edition)
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
                  {placeholders.map((placeholder) => {
                     const isAmountField = placeholder.includes('am') && !placeholder.includes('words');
                     const isWordsField = placeholder.endsWith('_words');
                     // Determine the value to display in the input field
                     const displayValue = isAmountField
                         ? formatCurrencyUzbekSum(formData[placeholder]) // Display formatted currency for amount fields
                         : formData[placeholder] || ''; // Display raw value for others

                     return (
                         <div key={placeholder} className="space-y-1">
                           <Label htmlFor={placeholder} className="text-sm font-medium text-foreground">
                             {placeholder} {isWordsField ? '(Auto-generated)' : ''}
                           </Label>
                           <Input
                             id={placeholder}
                             name={placeholder}
                             value={displayValue} // Use displayValue here
                             onChange={handleInputChange}
                             placeholder={`Enter value for {${placeholder}}`}
                             className={cn(
                               "bg-card",
                               isWordsField && 'text-muted-foreground italic' // Style the auto-generated field
                             )}
                             disabled={isProcessing || isWordsField} // Disable _words input
                             readOnly={isWordsField} // Make it read-only
                             type={'text'} // Use text type for all inputs now due to formatting
                             // Removed step={...} as type is text
                             // Add inputMode="numeric" for amount fields for better mobile UX
                             inputMode={isAmountField ? "decimal" : "text"}
                           />
                         </div>
                     );
                  })}
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

