import { Link, useLocation } from "wouter";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const [location] = useLocation();

  const isActive = (path: string) => {
    return location === path;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-20">
      <div className="fixed inset-y-0 left-0 max-w-xs w-full bg-white shadow-xl">
        <div className="p-4 border-b border-fb-gray flex items-center justify-between">
          <div className="flex items-center">
            <div className="bg-fb-blue text-white p-2 rounded-lg">
              <i className="fa-solid fa-bolt-lightning"></i>
            </div>
            <h1 className="ml-3 text-xl font-bold">FB Publisher</h1>
          </div>
          <button type="button" className="text-gray-500 hover:text-gray-700" onClick={onClose}>
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
        
        <nav className="mt-4">
          <div className="px-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Main
          </div>
          <Link href="/" onClick={onClose} className={`flex items-center px-4 py-3 ${isActive('/') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
            <i className="fa-solid fa-dashboard w-5"></i>
            <span className="ml-3">Dashboard</span>
          </Link>
          <Link href="/calendar" onClick={onClose} className={`flex items-center px-4 py-3 ${isActive('/calendar') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
            <i className="fa-solid fa-calendar w-5"></i>
            <span className="ml-3">Publishing Calendar</span>
          </Link>
          <Link href="/history" onClick={onClose} className={`flex items-center px-4 py-3 ${isActive('/history') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
            <i className="fa-solid fa-clock-rotate-left w-5"></i>
            <span className="ml-3">Publishing History</span>
          </Link>
          
          <div className="px-4 mt-6 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Configuration
          </div>
          <Link href="/facebook-accounts" onClick={onClose} className={`flex items-center px-4 py-3 ${isActive('/facebook-accounts') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
            <i className="fa-brands fa-facebook w-5"></i>
            <span className="ml-3">Facebook Accounts</span>
          </Link>
          <Link href="/google-sheets-integration" onClick={onClose} className={`flex items-center px-4 py-3 ${isActive('/google-sheets-integration') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
              <i className="fa-solid fa-table w-5"></i>
              <span className="ml-3">Google Sheets Integration</span>
          </Link>
          <Link href="/custom-labels" onClick={onClose} className={`flex items-center px-4 py-3 ${isActive('/custom-labels') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
            <i className="fa-solid fa-tag w-5"></i>
            <span className="ml-3">Custom Labels</span>
          </Link>
          <Link href="/settings" onClick={onClose} className={`flex items-center px-4 py-3 ${isActive('/settings') ? 'text-fb-blue bg-fb-light-gray border-l-4 border-fb-blue' : 'text-gray-600 hover:bg-fb-light-gray'}`}>
            <i className="fa-solid fa-gear w-5"></i>
            <span className="ml-3">Settings</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}
