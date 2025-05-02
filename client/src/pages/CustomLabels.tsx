import DashboardHeader from "@/components/common/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomLabels() {
  return (
    <>
      <DashboardHeader 
        title="Custom Labels" 
        subtitle="Create and manage content labels" 
        importLabel="Create Label"
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Label Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <i className="fa-solid fa-tags text-5xl mb-4"></i>
                <p>Label management will be implemented in a future update.</p>
                <p className="text-sm mt-2">This page would allow you to create and manage custom content labels.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
