import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from 'lucide-react';
import { Info, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type GoogleSheetsIntegration = {
  id: number;
  accessToken: string;
  refreshToken: string | null;
  folderId: string | null;
  spreadsheetId: string | null;
};

export default function GoogleSheetsIntegration() {
  const [authCode, setAuthCode] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const { toast } = useToast();

  // Define a response type that includes both connected and disconnected states
  type GoogleSheetsResponse = GoogleSheetsIntegration | { connected: false };
  
  const { data: integration, isLoading, isError, error } = useQuery<GoogleSheetsResponse>({
    queryKey: ['/api/google-sheets-integration'],
    retry: false,
  });

  const connectMutation = useMutation({
    mutationFn: async (data: { authCode?: string; spreadsheetId?: string }) => {
      return fetch('/api/google-sheets-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(res => {
        if (!res.ok) throw new Error('Failed to connect to Google Sheets');
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/google-sheets-integration'] });
      toast({
        title: "Success",
        description: "Google Sheets connected successfully!",
        variant: "default",
      });
      setAuthCode('');
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err.message || "Failed to connect Google Sheets",
        variant: "destructive",
      });
    }
  });

  const handleConnect = () => {
    if (!authCode) {
      toast({
        title: "Error",
        description: "Please enter an authorization code",
        variant: "destructive",
      });
      return;
    }
    connectMutation.mutate({ authCode });
  };

  const handleUpdateSpreadsheet = () => {
    if (!spreadsheetId) {
      toast({
        title: "Error",
        description: "Please enter a spreadsheet ID",
        variant: "destructive",
      });
      return;
    }
    connectMutation.mutate({ spreadsheetId });
  };

  const authUrl = "https://accounts.google.com/o/oauth2/v2/auth" +
    "?client_id=YOUR_GOOGLE_CLIENT_ID" +
    "&redirect_uri=YOUR_REDIRECT_URI" +
    "&response_type=code" +
    "&scope=https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file" +
    "&access_type=offline" +
    "&prompt=consent";

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">Google Sheets Integration</h1>
      
      <div className="space-y-6">
        {!integration ? (
          <Card>
            <CardHeader>
              <CardTitle>Connect to Google Sheets</CardTitle>
              <CardDescription>Import content directly from Google Sheets to create social media posts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Authentication Required</AlertTitle>
                <AlertDescription>
                  To connect to Google Sheets, you'll need to authenticate with your Google account and grant permission to access your spreadsheets.
                </AlertDescription>
              </Alert>
              
              <div>
                <p className="mb-2 text-sm text-muted-foreground">1. Click the button below to authorize access to Google Sheets</p>
                <Button variant="outline" className="mb-4" asChild>
                  <a href={authUrl} target="_blank" rel="noopener noreferrer">Authorize Google Sheets</a>
                </Button>
                
                <p className="mb-2 text-sm text-muted-foreground">2. Copy the authorization code from the redirect page</p>
                <div className="flex gap-2">
                  <Input 
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="Paste authorization code here"
                    className="max-w-lg"
                  />
                  <Button 
                    onClick={handleConnect} 
                    disabled={connectMutation.isPending || !authCode}
                  >
                    {connectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Connect
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Check className="h-5 w-5 text-green-500 mr-2" />
                Connected to Google Sheets
              </CardTitle>
              <CardDescription>Your Google Sheets integration is active and ready to use</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-muted p-4">
                <p className="text-sm font-medium mb-1">Integration Details:</p>
                <p className="text-sm text-muted-foreground">Spreadsheet ID: {integration && 'spreadsheetId' in integration ? integration.spreadsheetId || 'Not selected' : 'Not selected'}</p>
              </div>
              
              <div>
                <p className="mb-2 text-sm font-medium">Configure Spreadsheet</p>
                <div className="flex gap-2">
                  <Input 
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                    placeholder={integration && 'spreadsheetId' in integration ? integration.spreadsheetId || "Enter spreadsheet ID" : "Enter spreadsheet ID"}
                    className="max-w-lg"
                  />
                  <Button 
                    onClick={handleUpdateSpreadsheet} 
                    disabled={connectMutation.isPending || !spreadsheetId}
                    variant="outline"
                  >
                    {connectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Update
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  The spreadsheet ID is found in the URL of your Google Sheet: https://docs.google.com/spreadsheets/d/<span className="font-medium">SPREADSHEET_ID</span>/edit
                </p>
              </div>
              
              <Alert className="mt-4">
                <Info className="h-4 w-4" />
                <AlertTitle>How to format your spreadsheet</AlertTitle>
                <AlertDescription>
                  Your spreadsheet should have these columns: Content, Scheduled Date, Labels, Facebook Account, Media URL, Link (optional)
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter>
              <Button 
                variant="outline" 
                className="mt-2"
                onClick={() => window.location.href = "/"}
              >
                Import Posts from Spreadsheet
              </Button>
            </CardFooter>
          </Card>
        )}
        
        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "Failed to load Google Sheets integration"}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}