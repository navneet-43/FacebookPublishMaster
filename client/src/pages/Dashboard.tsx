import { useState } from "react";
import DashboardHeader from "@/components/common/DashboardHeader";
import StatsCards from "@/components/dashboard/StatsCards";
import UpcomingPostsCard from "@/components/dashboard/UpcomingPostsCard";
import GoogleSheetsImportCard from "@/components/dashboard/GoogleSheetsImportCard";
import RecentActivityCard from "@/components/dashboard/RecentActivityCard";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send } from "lucide-react";

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const publishDraftsMutation = useMutation({
    mutationFn: () => {
      return apiRequest('/api/publish-draft-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      toast({
        title: "Posts Published",
        description: `Successfully published ${data.published} posts to Facebook. ${data.failed > 0 ? `${data.failed} posts failed.` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Publishing Failed",
        description: error.message || "Failed to publish draft posts to Facebook",
        variant: "destructive"
      });
    }
  });

  const handleExport = () => {
    toast({
      title: "Export",
      description: "Export functionality is not implemented in this demo.",
    });
  };

  const handleImport = () => {
    setImportDialogOpen(true);
  };

  return (
    <>
      <DashboardHeader 
        title="Dashboard" 
        lastUpdated="Updated just now" 
        onExport={handleExport}
        onImport={handleImport}
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <StatsCards />
        
        {/* Manual Publish Card */}
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">
                  Publish all draft posts to Facebook immediately
                </p>
                <p className="text-xs text-gray-500">
                  Your Facebook tokens are working - use this to publish posts that didn't auto-publish
                </p>
              </div>
              <Button 
                onClick={() => publishDraftsMutation.mutate()}
                disabled={publishDraftsMutation.isPending}
                className="ml-4"
              >
                {publishDraftsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Publish Draft Posts
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <UpcomingPostsCard />
          
          <div className="space-y-6">
            <GoogleSheetsImportCard />
            <RecentActivityCard />
          </div>
        </div>
      </div>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Google Sheets</DialogTitle>
          </DialogHeader>
          <GoogleSheetsImportCard />
        </DialogContent>
      </Dialog>
    </>
  );
}
