import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileImage, UploadCloud, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MediaUploadProps {
  onMediaUploaded: (url: string) => void;
  existingUrl?: string;
  className?: string;
}

export default function MediaUpload({ onMediaUploaded, existingUrl, className }: MediaUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(existingUrl || null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // Basic file validation
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please select an image file (JPEG, PNG, GIF, etc.)",
        variant: "destructive"
      });
      return;
    }

    // Size validation (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 10MB",
        variant: "destructive"
      });
      return;
    }

    // Show local preview
    const reader = new FileReader();
    reader.onload = (evt) => {
      setPreview(evt.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to server
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('media', file);
      
      const response = await apiRequest('/api/media/upload', {
        method: 'POST',
        body: formData,
      }) as { success: boolean; mediaUrl: string; message: string };
      
      if (response.mediaUrl) {
        onMediaUploaded(response.mediaUrl);
        toast({
          title: "Upload successful",
          description: "Your image has been uploaded successfully",
        });
      } else {
        throw new Error("No media URL in response");
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "An error occurred while uploading",
        variant: "destructive"
      });
      // Reset preview on error
      setPreview(existingUrl || null);
    } finally {
      setUploading(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const clearImage = () => {
    setPreview(null);
    onMediaUploaded('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      
      {!preview ? (
        <div 
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50"
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
          <div className="mt-4 flex text-sm text-gray-600 justify-center">
            <Button 
              variant="ghost" 
              disabled={uploading}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FileImage className="mr-2 h-4 w-4" />
                  Upload image
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">PNG, JPG, GIF up to 10MB</p>
        </div>
      ) : (
        <div className="relative">
          <img 
            src={preview} 
            alt="Preview" 
            className="w-full h-48 object-cover rounded-md"
          />
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8 rounded-full"
            onClick={clearImage}
            disabled={uploading}
          >
            <X className="h-4 w-4" />
          </Button>
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}