import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { apiRequest } from '@/lib/queryClient';

export function EmergencyCleanupButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleEmergencyCleanup = async () => {
    setIsLoading(true);
    try {
      await apiRequest('/api/emergency-cleanup', {
        method: 'POST'
      });
      
      // Refresh the page after cleanup
      window.location.reload();
    } catch (error) {
      console.error('Emergency cleanup failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant="destructive" 
          size="sm"
          className="gap-2"
        >
          <AlertTriangle className="h-4 w-4" />
          Emergency Cleanup
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Emergency System Cleanup
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately kill all hanging video processing and clear temporary files.
            Use this if the system appears stuck or frozen.
            <br /><br />
            <strong>Warning:</strong> This will stop any uploads currently in progress.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleEmergencyCleanup}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? 'Cleaning...' : 'Force Cleanup'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}