import { UserManagement } from '@/components/admin/UserManagement';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Settings, Shield, Users, LogOut, ArrowLeft } from 'lucide-react';
import { Link, useLocation } from 'wouter';

export function AdminPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation('/login');
  };

  return (
    <ProtectedRoute requireAdmin>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="text-sm">Back to Dashboard</span>
                </Link>
                <div className="h-4 w-px bg-gray-300"></div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
                    <Shield className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h1 className="font-semibold text-gray-900">Admin Panel</h1>
                    <p className="text-xs text-gray-500">System Management</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">{user?.fullName}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Settings className="h-3 w-3" />
                      Administrator
                    </div>
                  </div>
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Admin
                  </Badge>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Admin Dashboard Overview */}
          <div className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-blue-900 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    User Management
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-900 mb-1">Active</div>
                  <p className="text-xs text-blue-700">Manage platform users and permissions</p>
                </CardContent>
              </Card>
              
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-green-900 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Security
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-900 mb-1">Secure</div>
                  <p className="text-xs text-green-700">Two-level authentication system</p>
                </CardContent>
              </Card>
              
              <Card className="border-purple-200 bg-purple-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-purple-900 flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    System
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-900 mb-1">Online</div>
                  <p className="text-xs text-purple-700">Platform running smoothly</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* User Management Section */}
          <UserManagement />
        </div>
      </div>
    </ProtectedRoute>
  );
}