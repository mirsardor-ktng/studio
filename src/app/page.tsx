'use client';

import type {ChangeEvent, FormEvent} from 'react';
import {useState, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
import {ScrollArea} from '@/components/ui/scroll-area';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {Loader2, Upload, Download, FileText, AlertCircle} from 'lucide-react';
import {generateDocument} from '@/actions/generateDocument';

// Simple regex to find placeholders like {placeholder_name}
const PLACEHOLDER_REGEX = /\{([^{}]+)\}/g;

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
      setGeneratedBlob(null); // Reset generated blob when a new file is uploaded

      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result;
        if (content instanceof ArrayBuffer) {
            try {
                // Dynamically import pizzip on the client-side
                const PizZip = (await import('pizzip')).default;
                const zip = new PizZip(content);
                const doc = zip.files['word/document.xml'];
                if (!doc) {
                    throw new Error('Could not find word/document.xml in the DOCX file.');
                }
                const xmlContent = doc.asText();

                // Extract placeholders
                const foundPlaceholders = new Set<string>();
                let match;
                while ((match = PLACEHOLDER_REGEX.exec(xmlContent)) !== null) {
                  foundPlaceholders.add(match[1]);
                }

                const uniquePlaceholders = Array.from(foundPlaceholders);
                setPlaceholders(uniquePlaceholders);

                // Initialize form data with empty strings for each placeholder
                const initialFormData: Record<string, string> = {};
                uniquePlaceholders.forEach((ph) => {
                  initialFormData[ph] = '';
                });
                setFormData(initialFormData);

            } catch (err) {
              console.error('Error processing DOCX file:', err);
              setError('Failed to process the DOCX template. Please ensure it is a valid .docx file and contains placeholders like {placeholder_name}.');
              setTemplateFile(null);
              setPlaceholders([]);
              setFormData({});
              setFileName('');
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
        // Update generated file name based on the uploaded file name
         if (templateFile) {
             setGeneratedFileName(`generated_${templateFile.name}`);
         }

      } else {
        setError(result.error || 'Failed to generate the document.');
      }
    } catch (err) {
      console.error('Error generating document:', err);
      setError('An unexpected error occurred during document generation.');
    } finally {
      setIsProcessing(false);
    }
  };

   const handleDownload = () => {
       if (generatedBlob && generatedFileName) {
           const url = window.URL.createObjectURL(generatedBlob);
           const a = document.createElement('a');
           a.href = url;
           a.download = generatedFileName; // Use the state variable for the filename
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

          {/* File Upload Section */}
          <div className="space-y-2">
            <Label htmlFor="template-upload" className="text-lg font-medium">
              1. Upload Template (.docx)
            </Label>
            <div className="flex items-center gap-4">
               <Input
                 id="template-upload"
                 type="file"
                 accept=".docx"
                 onChange={handleFileChange}
                 className="hidden"
                 disabled={isLoading || isProcessing}
               />
               <Button
                  variant="outline"
                  onClick={() => document.getElementById('template-upload')?.click()}
                  disabled={isLoading || isProcessing}
                  className="flex-shrink-0"
               >
                 <Upload className="mr-2 h-4 w-4" />
                 {fileName ? 'Change File' : 'Choose File'}
               </Button>
               {fileName && <span className="text-sm text-muted-foreground truncate">{fileName}</span>}
               {isLoading && <Loader2 className="h-5 w-5 animate-spin text-secondary-foreground" />}
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
          {generatedBlob && (
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
