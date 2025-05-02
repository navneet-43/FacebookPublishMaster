import DashboardHeader from "@/components/common/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FacebookAccounts() {
  return (
    <>
      <DashboardHeader 
        title="Facebook Accounts" 
        subtitle="Manage your connected Facebook pages" 
        importLabel="Connect Account"
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <i className="fa-brands fa-facebook text-5xl mb-4"></i>
                <p>Facebook account management will be implemented in a future update.</p>
                <p className="text-sm mt-2">This page would allow you to connect and manage Facebook business accounts.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
