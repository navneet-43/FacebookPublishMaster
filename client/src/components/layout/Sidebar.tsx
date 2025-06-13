import { Link, useLocation } from "wouter";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";
import UserMenu from "./UserMenu";

export default function Sidebar() {
  const [location] = useLocation();

  const isActive = (path: string) => {
    return location === path;
  };

  // Fetch the current user data
  const { user } = usePlatformAuth();

  return (
    <aside className="w-64 bg-white shadow-md hidden md:block">
      <div className="p-4 border-b border-fb-gray">
        <div className="flex items-center">
          <div className="bg-fb-blue text-white p-2 rounded-lg">
            <i className="fa-solid fa-bolt-lightning"></i>
          </div>
          <h1 className="ml-3 text-xl font-bold">SocialFlow</h1>
        </div>
      </div>
      
      <nav className="mt-4">
        <div className="px-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Main
        </div>
        <Link href="/" className={`flex items-center px-4 py-3 ${isActive('/') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-dashboard w-5"></i>
          <span className="ml-3">Dashboard</span>
        </Link>
        <Link href="/calendar" className={`flex items-center px-4 py-3 ${isActive('/calendar') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-calendar w-5"></i>
          <span className="ml-3">Publishing Calendar</span>
        </Link>
        <Link href="/history" className={`flex items-center px-4 py-3 ${isActive('/history') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-clock-rotate-left w-5"></i>
          <span className="ml-3">Publishing History</span>
        </Link>
        
        <div className="px-4 mt-6 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Configuration
        </div>
        <Link href="/facebook-accounts" className={`flex items-center px-4 py-3 ${isActive('/facebook-accounts') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-brands fa-facebook w-5"></i>
          <span className="ml-3">Facebook Accounts</span>
        </Link>
        <Link href="/google-sheets-integration" className={`flex items-center px-4 py-3 ${isActive('/google-sheets-integration') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-table w-5"></i>
          <span className="ml-3">Google Sheets Integration</span>
        </Link>
        <Link href="/excel-import" className={`flex items-center px-4 py-3 ${isActive('/excel-import') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-file-excel w-5"></i>
          <span className="ml-3">Excel Import</span>
        </Link>
        <Link href="/custom-labels" className={`flex items-center px-4 py-3 ${isActive('/custom-labels') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-tag w-5"></i>
          <span className="ml-3">Custom Labels</span>
        </Link>
        <Link href="/settings" className={`flex items-center px-4 py-3 ${isActive('/settings') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
          <i className="fa-solid fa-gear w-5"></i>
          <span className="ml-3">Settings</span>
        </Link>
      </nav>
      
      <div className="absolute bottom-0 w-64 border-t border-fb-gray p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <i className="fa-solid fa-user text-gray-500"></i>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">{user?.fullName || user?.username || "User"}</p>
              <p className="text-xs text-gray-500">{user?.email || "No email"}</p>
            </div>
          </div>
          <UserMenu />
        </div>
      </div>
    </aside>
  );
}
