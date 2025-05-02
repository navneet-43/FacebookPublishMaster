import { useState } from "react";
import DashboardHeader from "@/components/common/DashboardHeader";
import StatsCards from "@/components/dashboard/StatsCards";
import UpcomingPostsCard from "@/components/dashboard/UpcomingPostsCard";
import AsanaImportCard from "@/components/dashboard/AsanaImportCard";
import RecentActivityCard from "@/components/dashboard/RecentActivityCard";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Dashboard() {
  const { toast } = useToast();
  const [importDialogOpen, setImportDialogOpen] = useState(false);

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
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <UpcomingPostsCard />
          
          <div className="space-y-6">
            <AsanaImportCard />
            <RecentActivityCard />
          </div>
        </div>
      </div>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Asana</DialogTitle>
          </DialogHeader>
          <AsanaImportCard />
        </DialogContent>
      </Dialog>
    </>
  );
}
