import { useState } from "react";
import DashboardHeader from "@/components/common/DashboardHeader";
import StatsCards from "@/components/dashboard/StatsCards";
import UpcomingPostsCard from "@/components/dashboard/UpcomingPostsCard";
import GoogleSheetsImportCard from "@/components/dashboard/GoogleSheetsImportCard";
import RecentActivityCard from "@/components/dashboard/RecentActivityCard";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, Video, CheckCircle, AlertCircle, Tag, X } from "lucide-react";

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [videoUploadDialogOpen, setVideoUploadDialogOpen] = useState(false);
  const [videoFormData, setVideoFormData] = useState({
    mediaUrl: '',
    content: '',
    accountId: '',
    language: 'en',
    selectedLabels: [] as string[]
  });

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

  // Query for Facebook accounts
  const { data: facebookAccountsData = [] } = useQuery({
    queryKey: ['/api/facebook-accounts'],
    queryFn: () => apiRequest('/api/facebook-accounts')
  });

  // Query for custom labels
  const { data: customLabelsData = [] } = useQuery({
    queryKey: ['/api/custom-labels'],
    queryFn: () => apiRequest('/api/custom-labels')
  });

  // Ensure we have arrays for rendering
  const facebookAccounts = Array.isArray(facebookAccountsData) ? facebookAccountsData : [];
  const customLabels = Array.isArray(customLabelsData) ? customLabelsData : [];

  // Enhanced Google Drive Video Upload Mutation
  const videoUploadMutation = useMutation({
    mutationFn: async (data: {
      mediaUrl: string;
      content: string;
      accountId: string;
      language: string;
      selectedLabels: string[];
    }) => {
      console.log('🚀 STARTING ENHANCED GOOGLE DRIVE + CHUNKED UPLOAD');
      console.log('📊 Upload Data:', data);
      console.log('📱 Account ID:', data.accountId);
      console.log('🔗 Google Drive URL:', data.mediaUrl);
      console.log('🏷️ Custom Labels:', data.selectedLabels);
      
      const response = await apiRequest('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: data.content,
          mediaUrl: data.mediaUrl,
          mediaType: 'video',
          accountId: parseInt(data.accountId),
          language: data.language,
          labels: data.selectedLabels.length > 0 ? data.selectedLabels : ["2"], // Use selected labels or default
          status: 'immediate'
        })
      });
      
      console.log('✅ API Response:', response);
      return response;
    },
    onSuccess: (data: any) => {
      console.log('🎉 UPLOAD SUCCESS:', data);
      console.log('📊 Post ID:', data.id);
      console.log('✅ Enhanced Google Drive + Chunked Upload completed successfully');
      
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      toast({
        title: "Video Upload Success",
        description: `Enhanced Google Drive video uploaded successfully! Processing ${data.uploadedSizeMB ? data.uploadedSizeMB.toFixed(1) + 'MB' : 'large file'} with chunked upload.`,
      });
      
      setVideoUploadDialogOpen(false);
      setVideoFormData({ mediaUrl: '', content: '', accountId: '', language: 'en', selectedLabels: [] });
    },
    onError: (error: any) => {
      console.error('❌ UPLOAD ERROR:', error);
      console.error('🔧 Error Details:', error.message);
      
      toast({
        title: "Upload Failed",
        description: error.message || "Enhanced Google Drive upload failed. Check console for details.",
        variant: "destructive"
      });
    }
  });

  const handleVideoUpload = () => {
    if (!videoFormData.mediaUrl || !videoFormData.content || !videoFormData.accountId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    console.log('🎯 INITIATING ENHANCED GOOGLE DRIVE UPLOAD');
    console.log('📋 Form Data:', videoFormData);
    
    videoUploadMutation.mutate(videoFormData);
  };

  const isGoogleDriveUrl = (url: string) => {
    return url.includes('drive.google.com');
  };

  const toggleLabel = (labelId: string) => {
    setVideoFormData(prev => {
      const newLabels = prev.selectedLabels.includes(labelId)
        ? prev.selectedLabels.filter(id => id !== labelId)
        : [...prev.selectedLabels, labelId];
      
      console.log('🏷️ Updated selected labels:', newLabels);
      return { ...prev, selectedLabels: newLabels };
    });
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
        
        {/* Enhanced Google Drive Video Upload Card */}
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-green-600" />
              Enhanced Google Drive Video Upload
              {isGoogleDriveUrl(videoFormData.mediaUrl) && (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">
                  Upload large videos (up to 400MB+) from Google Drive with chunked upload
                </p>
                <p className="text-xs text-gray-500">
                  Enhanced downloader + FFmpeg encoding + Facebook chunked upload for quality preservation
                </p>
              </div>
              <Button 
                onClick={() => setVideoUploadDialogOpen(true)}
                className="ml-4 bg-green-600 hover:bg-green-700"
              >
                <Video className="h-4 w-4 mr-2" />
                Upload Video
              </Button>
            </div>
          </CardContent>
        </Card>

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

      {/* Enhanced Google Drive Video Upload Dialog */}
      <Dialog open={videoUploadDialogOpen} onOpenChange={setVideoUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-green-600" />
              Enhanced Google Drive Video Upload
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="mediaUrl">Google Drive Video URL</Label>
              <Input
                id="mediaUrl"
                placeholder="https://drive.google.com/file/d/..."
                value={videoFormData.mediaUrl}
                onChange={(e) => {
                  const url = e.target.value;
                  setVideoFormData(prev => ({ ...prev, mediaUrl: url }));
                  
                  if (isGoogleDriveUrl(url)) {
                    console.log('✅ Google Drive URL detected:', url);
                    console.log('🔧 Enhanced downloader will be used');
                  }
                }}
                className={isGoogleDriveUrl(videoFormData.mediaUrl) ? 'border-green-300' : ''}
              />
              {isGoogleDriveUrl(videoFormData.mediaUrl) && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Enhanced Google Drive processing enabled
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="content">Post Content</Label>
              <Textarea
                id="content"
                placeholder="Enter your post content..."
                value={videoFormData.content}
                onChange={(e) => setVideoFormData(prev => ({ ...prev, content: e.target.value }))}
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="accountId">Facebook Page</Label>
              <Select 
                value={videoFormData.accountId} 
                onValueChange={(value) => {
                  setVideoFormData(prev => ({ ...prev, accountId: value }));
                  console.log('📱 Selected Facebook page ID:', value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Facebook page" />
                </SelectTrigger>
                <SelectContent>
                  {facebookAccounts.map((account: any) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="language">Language</Label>
              <Select 
                value={videoFormData.language} 
                onValueChange={(value) => setVideoFormData(prev => ({ ...prev, language: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Custom Labels (Meta Insights)
              </Label>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {customLabels.map((label: any) => {
                    const isSelected = videoFormData.selectedLabels.includes(label.id.toString());
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => {
                          console.log(`🏷️ Toggling label: ${label.name} (ID: ${label.id})`);
                          toggleLabel(label.id.toString());
                        }}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          isSelected 
                            ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                            : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        <div 
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: label.color }}
                        ></div>
                        {label.name}
                        {isSelected && <X className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
                {videoFormData.selectedLabels.length > 0 && (
                  <p className="text-xs text-blue-600 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {videoFormData.selectedLabels.length} label(s) selected for Meta Insights tracking
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Select labels to track video performance in Facebook Meta Insights
                </p>
              </div>
            </div>

            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
              <h4 className="text-sm font-medium text-green-800 mb-2">Enhanced Upload Features</h4>
              <ul className="text-xs text-green-700 space-y-1">
                <li>• Downloads large Google Drive videos (400MB+)</li>
                <li>• FFmpeg encoding for Facebook compatibility</li>
                <li>• Chunked upload supports up to 1.75GB</li>
                <li>• Quality preservation with zero compression loss</li>
                <li>• Console logging for real-time progress tracking</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setVideoUploadDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleVideoUpload}
                disabled={videoUploadMutation.isPending || !videoFormData.mediaUrl || !videoFormData.content || !videoFormData.accountId}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {videoUploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Video className="h-4 w-4 mr-2" />
                    Upload Video
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
