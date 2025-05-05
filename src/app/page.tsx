
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
        // Add basic check to prevent errors if context or context.scopePathItem is undefined
         if (!context || !context.scopePathItem) {
             return undefined;
         }

        // Original logic from fix, seems okay but check context validity first
         const resolved = context.scopePathItem;
         // Ensure resolved is an array before accessing length
         // Check if resolved exists and is an array before accessing length
          if (!resolved || !Array.isArray(resolved) || context.scopePathLength >= resolved.length) {
             return undefined;
         }
         const value = resolved[context.scopePathLength];
         return value; // Return the value found in scope path
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
                 // Exclude auto-generated fields if they appear raw in template (shouldn't normally)
                 if (key !== 'director_name_genitive' && !key.endsWith('_words')) {
                     filteredTags[key] = potentialTags[key];
                 } else if (key.endsWith('_words')) {
                    // Check if corresponding _am field exists
                    const baseAmField = key.replace('_words', '_am');
                    if (potentialTags.hasOwnProperty(baseAmField)) {
                       // Only include the _words field if the base _am field is also present
                        filteredTags[key] = potentialTags[key];
                    }
                 } else if (key === 'director_name_genitive') {
                     // Only include genitive if base director_name exists
                     if (potentialTags.hasOwnProperty('director_name')) {
                        filteredTags[key] = potentialTags[key];
                     }
                 }
             }
         }
     }
     // Additional check on inspect.tags if the above yields nothing, applying same filter
      if (Object.keys(filteredTags).length === 0 && this.inspect.tags) {
          for (const key in this.inspect.tags) {
               if (Object.prototype.hasOwnProperty.call(this.inspect.tags, key)) {
                   if (/^[a-zA-Z0-9_]+$/.test(key)) {
                       // Exclude auto-generated fields here too
                        if (key !== 'director_name_genitive' && !key.endsWith('_words')) {
                            filteredTags[key] = this.inspect.tags[key];
                        } else if (key.endsWith('_words')) {
                            const baseAmField = key.replace('_words', '_am');
                            if (this.inspect.tags.hasOwnProperty(baseAmField)) {
                                filteredTags[key] = this.inspect.tags[key];
                            }
                        } else if (key === 'director_name_genitive') {
                            if (this.inspect.tags.hasOwnProperty('director_name')) {
                                filteredTags[key] = this.inspect.tags[key];
                            }
                        }
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

/**
 * Converts a Russian name (Фамилия И. О.) to the genitive case.
 * This is a simplified implementation focusing on common endings.
 * @param name The name in nominative case (e.g., "Иванов И. И." or "Байсеитова У.")
 * @returns The name potentially converted to genitive case (e.g., "Иванова И. И." or "Байсеитовой У.")
 */
function getGenitiveCase(name: string | undefined): string {
    if (!name || typeof name !== 'string') return '';

    const parts = name.trim().split(' ');
    if (parts.length === 0) return '';

    let lastName = parts[0];
    const initials = parts.slice(1).join(' '); // Keep initials as they are

    // Rules priority: Specific endings first, then more general ones.

    // Feminine endings -ова/-ева/-ина/-ая -> -овой/-евой/-иной/-ой
     if (lastName.endsWith('ова') || lastName.endsWith('ева') || lastName.endsWith('ина')) {
         lastName = lastName.substring(0, lastName.length - 1) + 'ой';
     } else if (lastName.endsWith('ая')) {
         lastName = lastName.substring(0, lastName.length - 2) + 'ой';
     }
    // More general feminine -а -> -ой (e.g., Петрова -> Петровой, Байматова -> Байматовой)
    // Ensure not changing masculine -ска/-цка
    else if (lastName.endsWith('а') && !lastName.endsWith('ска') && !lastName.endsWith('цка')) {
        lastName = lastName.substring(0, lastName.length - 1) + 'ой';
    }
    // Feminine ending -я -> -и (e.g., Синяя -> Синей - already covered by -ая? No, consider Берия -> Берии)
    // Also applies to nouns like Мария -> Марии, but surnames are less common. Let's try -и.
    else if (lastName.endsWith('я') && !lastName.endsWith('ая') /* avoid double rule */) {
        lastName = lastName.substring(0, lastName.length - 1) + 'и';
    }
    // Masculine endings -ов/-ев/-ин -> -ова/-ева/-ина (e.g. Иванов -> Иванова)
    else if (lastName.endsWith('ов') || lastName.endsWith('ев')) {
        lastName += 'а';
    } else if (lastName.endsWith('ин') && !lastName.endsWith('шин') && !lastName.endsWith('чин')) { // Avoid -шин/-чин common in masculine
        lastName += 'а';
    }
    // Masculine endings -ский/-цкий -> -ского/-цкого (e.g. Невский -> Невского)
    else if (lastName.endsWith('ский') || lastName.endsWith('цкий')) {
      lastName = lastName.substring(0, lastName.length - 2) + 'ого';
    }
    // Masculine ending -ой -> -ого (e.g., Толстой -> Толстого)
    else if (lastName.endsWith('ой')) {
        lastName = lastName.substring(0, lastName.length - 2) + 'ого';
    }
    // Masculine ending -ый/-ий -> -ого/-его (e.g. Белый -> Белого)
    else if (lastName.endsWith('ый') || lastName.endsWith('ий')) {
        lastName = lastName.substring(0, lastName.length - 2) + 'ого';
    }
    // Masculine surnames ending in soft sign 'ь' -> 'я' (e.g. Воробей -> Воробья)
    else if (lastName.endsWith('ь')) {
        lastName = lastName.substring(0, lastName.length - 1) + 'я';
    }
    // Masculine ending in consonant -> add 'а' (e.g. Мельник -> Мельника)
    // Exclude 'й' which is handled by -ый/-ий or -ой
    else if (/[бвгджзклмнпрстфхцчшщ]$/i.test(lastName)) {
         lastName += 'а';
    }

    // Reassemble the name
    return initials ? `${lastName} ${initials}` : lastName;
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

                 // Initialize Docxtemplater ONLY with the module for inspection
                const doc = new Docxtemplater(zip, {
                     modules: [iModule], // Use the module
                     paragraphLoop: true,
                     linebreaks: true,
                     // Custom parser to handle potential errors gracefully during inspection
                      parser: (tag) => {
                        return {
                          get: (scope: any, context: any) => {
                            // Simplified getter for inspection: just return the tag name itself
                            // This avoids errors if the tag is complex or refers to missing data
                            // The actual data handling happens later during generation
                             if (tag === '.') {
                                 return scope;
                             }
                            // Return undefined for inspection purposes, letting the module collect the tag name
                             return undefined;
                          },
                        };
                      },
                     // Keep nullGetter in module for completeness, but parser above handles inspection phase
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
                     // Avoid logging "Cannot read property 'toString' of undefined" which is expected here
                    if (!renderError.message || !renderError.message.includes('toString')) {
                         console.warn("Inspection render encountered an error (might be ignorable if tags were found):", renderError.message);
                    }
                     // Check if it's a 'missing data' type error, which we expect here.
                     if (renderError.properties?.id !== 'render_error' && renderError.properties?.id !== 'scope_error') {
                        // If it's not a simple render/scope error, maybe re-throw or log more severely
                        console.error('Potentially problematic error during inspection render:', renderError);
                        // Set an error state if it's likely a template issue
                        setError(`Template Parsing Issue: ${renderError.message}. Check template syntax.`);
                     }
                     // Continue anyway, hoping tags were collected during compile/parse phase
                 }


                // Get the tags collected by the inspection module
                const tagsObject = iModule.getAllTags();
                 // Filter out the auto-generated fields from the initial list shown to the user
                let userVisiblePlaceholders = Object.keys(tagsObject)
                    .filter(ph => ph !== 'director_name_genitive' && !ph.endsWith('_words'));


                 // Check if 'director_name' exists to decide if 'director_name_genitive' should be added
                 const hasDirectorName = userVisiblePlaceholders.includes('director_name');
                 const allDetectedPlaceholders = Object.keys(tagsObject); // All tags found by module


                // Create the final list of placeholders including auto-generated ones in correct order
                let finalPlaceholders: string[] = [];
                userVisiblePlaceholders.forEach(ph => {
                    finalPlaceholders.push(ph);
                    // If this is director_name and the genitive version was detected, add it next
                    if (ph === 'director_name' && allDetectedPlaceholders.includes('director_name_genitive')) {
                        finalPlaceholders.push('director_name_genitive');
                    }
                    // If this is an _am field and the _words version was detected, add it next
                    const wordsField = ph.replace('_am', '_words');
                     if (ph.endsWith('_am') && allDetectedPlaceholders.includes(wordsField)) {
                        finalPlaceholders.push(wordsField);
                    }
                });

                // Handle cases where _words or _genitive might exist without the base (less likely now)
                // Or if the order was different in the original list. This ensures they are included if detected.
                allDetectedPlaceholders.forEach(ph => {
                   if ((ph.endsWith('_words') || ph === 'director_name_genitive') && !finalPlaceholders.includes(ph)) {
                      // Try to insert after the base field if possible, otherwise add at the end
                       const baseField = ph === 'director_name_genitive' ? 'director_name' : ph.replace('_words', '_am');
                       const baseIndex = finalPlaceholders.indexOf(baseField);
                       if (baseIndex !== -1) {
                           finalPlaceholders.splice(baseIndex + 1, 0, ph);
                       } else {
                            // If base wasn't found (unlikely) or already processed, just add it
                            if (!finalPlaceholders.includes(ph)) {
                                finalPlaceholders.push(ph);
                            }
                       }
                   }
                });



                 // If no user-visible tags found and there wasn't a serious error already, report template issue
                if (userVisiblePlaceholders.length === 0 && !error) {
                    setError("No user-editable placeholders like {placeholder_name} found, or the template might have syntax errors preventing parsing.");
                }


                setPlaceholders(finalPlaceholders); // Use the final ordered list

                // Initialize form data
                const initialFormData: Record<string, string> = {};
                 const currentFormData = { ...formData }; // Capture current state for pre-filling
                finalPlaceholders.forEach((ph) => {
                  // Pre-fill director_name_genitive based on director_name
                  if (ph === 'director_name_genitive') {
                    initialFormData[ph] = getGenitiveCase(currentFormData['director_name'] || '');
                  } else {
                      initialFormData[ph] = currentFormData[ph] || ''; // Keep existing or empty
                  }

                  // Pre-fill _words fields if the base _am field exists (using captured state)
                   if (ph.endsWith('_words')) { // Check for '_words' suffix
                       const baseName = ph.replace(/_words$/, '_am'); // Find corresponding _am field name
                       if (currentFormData[baseName]) { // Check if base field has data in current form state
                            const rawAmount = getRawNumericValue(currentFormData[baseName]);
                            initialFormData[ph] = rawAmount !== null ? numberToWords(rawAmount) : '';
                       } else {
                            initialFormData[ph] = ''; // Ensure it's empty if base is empty
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
       // Identify amount fields: contains '_am' and does NOT end with '_words'
       const isAmountField = name.includes('_am') && !name.endsWith('_words'); // Update exclusion

        setFormData((prevData) => {
            const newData = { ...prevData };

            if (isAmountField) {
                 // Keep raw numeric value or cleaned string in state for processing
                 const rawValue = value.replace(/[^0-9.]/g, ''); // Allow only numbers and dot
                 newData[name] = rawValue; // Store the cleaned numeric string

                 // Automatically update corresponding _words field
                 const wordsFieldName = name.replace(/_am$/, '_words'); // Construct the _words field name
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
                 // If director_name changes, update director_name_genitive
                 if (name === 'director_name' && newData.hasOwnProperty('director_name_genitive')) {
                     newData['director_name_genitive'] = getGenitiveCase(value);
                 }
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

        // Prepare data for docxtemplater, formatting amount fields and genitive case
        const processedData: Record<string, string> = {};
        for (const key in formData) {
             // Format amount fields (contain '_am', not '_words') for the document
             if (key.includes('_am') && !key.endsWith('_words')) { // Update exclusion
                 processedData[key] = formatCurrencyUzbekSum(formData[key]);
             }
             // Generate genitive case for 'director_name' - ensure correct key is used
             else if (key === 'director_name_genitive') {
                 // Value is already pre-calculated and stored in formData state
                 processedData[key] = formData[key];
             }
             // Ensure director_name itself is passed correctly (not genitive)
             else if (key === 'director_name') {
                processedData[key] = formData[key];
             }
             else {
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
                <span className="text-base text-muted-foreground">Umida edition</span>
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
              <p className="text-xs text-muted-foreground">Placeholders should be in the format {'{placeholder_name}'}. Use {'{amount_am}'} for numbers and {'{amount_words}'} for text conversion. {'{director_name_genitive}'} is auto-generated.</p> {/* Updated instruction */}
            </div>

          {/* Placeholder Input Section */}
          {placeholders.length > 0 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Label className="text-lg font-medium">2. Fill Placeholder Values</Label>
              <ScrollArea className="h-64 w-full rounded-md border p-4 bg-secondary/30">
                <div className="space-y-4">
                  {placeholders.map((placeholder) => {
                     // Check if it's an amount field (contains _am, not _words)
                     const isAmountField = placeholder.includes('_am') && !placeholder.endsWith('_words'); // Update exclusion
                     // Check if it's a words field (ends with _words)
                     const isWordsField = placeholder.endsWith('_words'); // Update check
                     // Check if it's the auto-generated genitive field
                     const isGenitiveField = placeholder === 'director_name_genitive';

                     // Determine if the field is auto-generated
                     const isAutoGenerated = isWordsField || isGenitiveField;

                     // Determine the value to display in the input field
                     const displayValue = isAmountField
                         ? formatCurrencyUzbekSum(formData[placeholder]) // Display formatted currency for amount fields
                         : formData[placeholder] || ''; // Display raw value for others

                     return (
                         <div key={placeholder} className="space-y-1">
                           <Label htmlFor={placeholder} className="text-sm font-medium text-foreground">
                             {placeholder} {isAutoGenerated ? '(Auto-generated)' : ''}
                           </Label>
                           <Input
                             id={placeholder}
                             name={placeholder}
                             value={displayValue} // Use displayValue here
                             onChange={handleInputChange}
                             placeholder={`Enter value for {${placeholder}}`}
                             className={cn(
                               "bg-card",
                               isAutoGenerated && 'text-muted-foreground italic bg-muted/50 cursor-not-allowed' // Style the auto-generated field
                             )}
                             disabled={isProcessing || isAutoGenerated} // Disable auto-generated inputs
                             readOnly={isAutoGenerated} // Make it read-only
                             type={'text'} // Use text type for all inputs now due to formatting
                             // Add inputMode="decimal" for amount fields for better mobile UX
                             inputMode={isAmountField ? "decimal" : "text"}
                             aria-describedby={isAutoGenerated ? `${placeholder}-desc` : undefined}
                           />
                            {isGenitiveField && (
                              <p id={`${placeholder}-desc`} className="text-xs text-muted-foreground">
                                Automatically generated genitive case based on {'{director_name}'}.
                              </p>
                             )}
                              {isWordsField && (
                               <p id={`${placeholder}-desc`} className="text-xs text-muted-foreground">
                                 Automatically generated words based on {'{' + placeholder.replace('_words', '_am') + '}'}.
                               </p>
                             )}
                         </div>
                     );
                  })}
                </div>
              </ScrollArea>

               {/* Generate Button */}
                <Button
                    type="submit"
                    disabled={isProcessing || isLoading || !templateFile || placeholders.filter(p => p !== 'director_name_genitive' && !p.endsWith('_words')).length === 0} // Disable if no user-editable placeholders
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

