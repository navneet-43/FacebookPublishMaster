import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { FacebookAccount } from "@shared/schema";
import { AlertCircle, Settings, FileSpreadsheet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GoogleSheetsSetupSimple } from "@/components/common/GoogleSheetsSetupSimple";

export default function GoogleSheetsImportCard() {
  const { toast } = useToast();
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [accountId, setAccountId] = useState("");
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  // Fetch Facebook accounts
  const { data: accounts = [] } = useQuery<FacebookAccount[]>({
    queryKey: ['/api/facebook-accounts'],
    staleTime: 60000,
  });

  // Check Google Sheets integration status
  const { data: integration } = useQuery({
    queryKey: ['/api/google-sheets-integration'],
    staleTime: 60000,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/import-from-google-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          spreadsheetId, 
          sheetName,
          accountId: parseInt(accountId),
          range: "A:Z"
        })
      });
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      toast({
        title: "Import successful",
        description: data?.message || 'Posts imported successfully from Google Sheets.',
      });
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: `Failed to import from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });

  const setupMutation = useMutation({
    mutationFn: async (data: { accessToken: string; spreadsheetId: string }) => {
      return apiRequest('/api/google-sheets-integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/google-sheets-integration'] });
      toast({
        title: "Integration setup",
        description: "Google Sheets integration configured successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Setup failed",
        description: `Failed to setup integration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });

  const handleImport = () => {
    if (!spreadsheetId || !sheetName || !accountId) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate();
  };

  const handleSetupComplete = (credentials: { accessToken: string; spreadsheetId: string }) => {
    setupMutation.mutate(credentials);
    setSpreadsheetId(credentials.spreadsheetId);
    setShowSetupGuide(false);
  };

  const isConnected = integration && (integration as any).accessToken;

  return (
    <Card>
      <CardHeader className="px-6 py-5 border-b border-fb-gray">
        <CardTitle className="text-lg font-semibold">Import from Google Sheets</CardTitle>
      </CardHeader>
      
      <CardContent className="p-6">
        {!isConnected ? (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Connect your Google Sheets account to import content data.
              </AlertDescription>
            </Alert>
            
            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline"
                onClick={() => setShowSetupGuide(true)}
                className="flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Setup Guide
              </Button>
              <Button 
                className="bg-fb-blue hover:bg-blue-700"
                onClick={() => setShowSetupGuide(true)}
                disabled={setupMutation.isPending}
              >
                {setupMutation.isPending ? "Setting up..." : "Quick Setup"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="spreadsheet-id" className="block text-sm font-medium text-gray-700 mb-1">
                Spreadsheet ID
              </Label>
              <Input
                id="spreadsheet-id"
                placeholder="Enter Google Spreadsheet ID"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="sheet-name" className="block text-sm font-medium text-gray-700 mb-1">
                Sheet Name
              </Label>
              <Input
                id="sheet-name"
                placeholder="Sheet1"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="facebook-account" className="block text-sm font-medium text-gray-700 mb-1">
                Facebook Page
              </Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Facebook page" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">f</span>
                        </div>
                        {account.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Expected columns: Content, MediaURL, MediaType, Language, Labels, ScheduledFor, Link
              </AlertDescription>
            </Alert>
            
            <Button 
              className="w-full bg-fb-blue hover:bg-blue-700"
              onClick={handleImport}
              disabled={importMutation.isPending || !spreadsheetId || !accountId}
            >
              {importMutation.isPending ? "Importing..." : "Import Content"}
            </Button>
          </div>
        )}
        
        <GoogleSheetsSetupSimple
          isOpen={showSetupGuide}
          onClose={() => setShowSetupGuide(false)}
          onComplete={handleSetupComplete}
        />
      </CardContent>
    </Card>
  );
}