import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import AllPosts from "@/pages/AllPosts";
import PublishingCalendar from "@/pages/PublishingCalendar";
import PublishingHistory from "@/pages/PublishingHistory";
import FacebookAccounts from "@/pages/FacebookAccounts";
import GoogleSheetsIntegration from "@/pages/GoogleSheetsIntegration";
import ExcelImport from "@/pages/ExcelImport";
import CustomLabels from "@/pages/CustomLabels";
import Settings from "@/pages/Settings";
import ReportsPage from "@/pages/ReportsPage";
import { LoginPage } from "@/pages/LoginPage";
import { AdminPage } from "@/pages/AdminPage";

import Sidebar from "@/components/layout/Sidebar";
import MobileMenu from "@/components/layout/MobileMenu";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState } from "react";

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={LoginPage} />
      
      {/* Admin routes */}
      <Route path="/admin" component={AdminPage} />
      
      {/* Protected main app routes */}
      <Route path="/">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/posts">
        <ProtectedRoute>
          <AllPosts />
        </ProtectedRoute>
      </Route>
      <Route path="/calendar">
        <ProtectedRoute>
          <PublishingCalendar />
        </ProtectedRoute>
      </Route>
      <Route path="/publishing-calendar">
        <ProtectedRoute>
          <PublishingCalendar />
        </ProtectedRoute>
      </Route>
      <Route path="/history">
        <ProtectedRoute>
          <PublishingHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/facebook-accounts">
        <ProtectedRoute>
          <FacebookAccounts />
        </ProtectedRoute>
      </Route>
      <Route path="/google-sheets">
        <ProtectedRoute>
          <GoogleSheetsIntegration />
        </ProtectedRoute>
      </Route>
      <Route path="/excel-import">
        <ProtectedRoute>
          <ExcelImport />
        </ProtectedRoute>
      </Route>
      <Route path="/custom-labels">
        <ProtectedRoute>
          <CustomLabels />
        </ProtectedRoute>
      </Route>
      <Route path="/reports">
        <ProtectedRoute>
          <ReportsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  // Show full-screen layout for login and admin pages
  if (!isAuthenticated || isLoading) {
    return <Router />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      
      <MobileMenu 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)} 
      />
      
      <main className="flex-1 overflow-x-hidden overflow-y-auto md:pt-0 pt-16">
        <div className="md:hidden fixed top-0 left-0 right-0 bg-white z-10 shadow-sm">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center">
              <div className="bg-fb-blue text-white p-2 rounded-lg">
                <i className="fa-solid fa-bolt-lightning"></i>
              </div>
              <h1 className="ml-3 text-xl font-bold">SocialFlow</h1>
            </div>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-600 hover:text-gray-800 p-2"
            >
              <i className="fa-solid fa-bars"></i>
            </button>
          </div>
        </div>
        
        <Router />
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthenticatedApp />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;