import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardHeader from "@/components/common/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Instagram } from "lucide-react";

interface InstagramAccount {
  id: number;
  userId: number;
  username: string;
  businessAccountId: string;
  connectedPageId: string;
  accessToken: string;
  profilePictureUrl?: string;
  followersCount?: number;
  isActive: boolean;
}

export default function InstagramAccounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [pageAccessToken, setPageAccessToken] = useState("");

  const { data: accounts = [], isLoading } = useQuery<InstagramAccount[]>({
    queryKey: ['/api/instagram-accounts'],
    staleTime: 60000
  });

  const connectAccountMutation = useMutation({
    mutationFn: (pageAccessToken: string) => {
      return apiRequest('/api/instagram-accounts/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageAccessToken })
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/instagram-accounts'] });
      toast({
        title: "Instagram Connected",
        description: data.message || "Successfully connected Instagram Business account(s)."
      });
      setIsConnectDialogOpen(false);
      setPageAccessToken("");
    },
    onError: (error) => {
      toast({
        title: "Connection Failed",
        description: (error as Error).message || "Failed to connect Instagram account. Make sure you have an Instagram Business account linked to your Facebook Page.",
        variant: "destructive"
      });
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest(`/api/instagram-accounts/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/instagram-accounts'] });
      toast({
        title: "Account Removed",
        description: "Instagram account disconnected successfully."
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to remove Instagram account.",
        variant: "destructive"
      });
    }
  });

  const toggleAccountMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number, isActive: boolean }) => {
      return apiRequest(`/api/instagram-accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/instagram-accounts'] });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: (error as Error).message || "Failed to update account status.",
        variant: "destructive"
      });
    }
  });

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageAccessToken.trim()) {
      toast({
        title: "Token Required",
        description: "Please enter a Facebook Page access token.",
        variant: "destructive"
      });
      return;
    }
    connectAccountMutation.mutate(pageAccessToken);
  };

  return (
    <>
      <DashboardHeader 
        title="Instagram Accounts" 
        subtitle="Manage your Instagram Business accounts" 
        importLabel="Connect Instagram"
        showImport={true}
        onImport={() => setIsConnectDialogOpen(true)}
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="mb-6 bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/20 dark:to-purple-950/20 border-pink-200 dark:border-pink-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Instagram className="h-5 w-5 text-pink-600" />
              How to Connect Instagram Business Account
            </CardTitle>
            <CardDescription>
              Follow these steps to connect your Instagram Business account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Make sure you have an Instagram Business or Creator account</li>
              <li>Link your Instagram account to a Facebook Page (in Instagram settings)</li>
              <li>Get your Facebook Page access token from <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Graph API Explorer</a></li>
              <li>Grant these permissions: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">instagram_basic</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">instagram_content_publish</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">pages_read_engagement</code></li>
              <li>Click "Connect Instagram" button above and paste your Page access token</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription>
              Manage Instagram Business accounts for automated posting
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-60 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="h-60 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Instagram className="h-12 w-12 mx-auto mb-4 text-pink-600" />
                  <p className="font-medium">No Instagram accounts connected</p>
                  <p className="text-sm mt-2">Connect your Instagram Business account to start posting</p>
                  <Button 
                    variant="default" 
                    className="mt-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
                    onClick={() => setIsConnectDialogOpen(true)}
                    data-testid="button-connect-instagram"
                  >
                    <Instagram className="h-4 w-4 mr-2" />
                    Connect Instagram
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {accounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                    <div className="flex items-center space-x-4">
                      {account.profilePictureUrl ? (
                        <img 
                          src={account.profilePictureUrl} 
                          alt={account.username}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <Instagram className="h-10 w-10 text-pink-600" />
                      )}
                      <div>
                        <p className="font-medium">@{account.username}</p>
                        <p className="text-sm text-gray-500">
                          {account.followersCount ? `${account.followersCount.toLocaleString()} followers` : 'Business Account'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Switch 
                          checked={account.isActive}
                          onCheckedChange={(checked) => 
                            toggleAccountMutation.mutate({ id: account.id, isActive: checked })
                          }
                          data-testid={`switch-active-${account.id}`}
                        />
                        <span className={account.isActive ? "text-green-600" : "text-gray-500"}>
                          {account.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon" data-testid={`button-delete-${account.id}`}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Instagram Account?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will disconnect @{account.username} from your publishing platform. Scheduled posts for this account will be canceled.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => deleteAccountMutation.mutate(account.id)}
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          {accounts.length > 0 && (
            <CardFooter>
              <Button 
                variant="outline"
                onClick={() => setIsConnectDialogOpen(true)}
                data-testid="button-connect-more"
              >
                <Instagram className="h-4 w-4 mr-2" />
                Connect Another Account
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>

      {/* Connect Instagram Dialog */}
      <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Instagram className="h-5 w-5 text-pink-600" />
              Connect Instagram Business Account
            </DialogTitle>
            <DialogDescription>
              Enter your Facebook Page access token to connect your linked Instagram Business account
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConnect}>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="pageAccessToken">Facebook Page Access Token</Label>
                <Input
                  id="pageAccessToken"
                  name="pageAccessToken"
                  type="password"
                  placeholder="Paste your Facebook Page access token here"
                  value={pageAccessToken}
                  onChange={(e) => setPageAccessToken(e.target.value)}
                  required
                  data-testid="input-page-access-token"
                />
                <p className="text-xs text-gray-500">
                  This token should have instagram_basic and instagram_content_publish permissions
                </p>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsConnectDialogOpen(false)}
                data-testid="button-cancel-connect"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={connectAccountMutation.isPending}
                className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700"
                data-testid="button-submit-connect"
              >
                {connectAccountMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Connect Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
