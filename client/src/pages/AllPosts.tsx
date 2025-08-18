import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CalendarIcon, Filter } from "lucide-react";
import { format, subDays } from "date-fns";
import type { Post } from "@shared/schema";

export default function AllPosts() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pageFilter, setPageFilter] = useState("all");
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Ensure scroll isn't blocked when popover is open
  useEffect(() => {
    const enableScroll = () => {
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    };

    if (datePickerOpen) {
      enableScroll();
      // Also ensure scroll after a slight delay
      const timer = setTimeout(enableScroll, 50);
      return () => clearTimeout(timer);
    }
  }, [datePickerOpen]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
  });

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ["/api/facebook-accounts"],
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      await apiRequest(`/api/posts/${postId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Post deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to delete post: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredPosts = posts.filter((post) => {
    const matchesFilter = filter === "all" || post.status === filter;
    const matchesSearch = search === "" || 
      post.content.toLowerCase().includes(search.toLowerCase());
    const matchesPage = pageFilter === "all" || post.accountId === parseInt(pageFilter);
    
    // Date range filtering
    let matchesDate = true;
    if (dateRange !== 'all' && post.createdAt) {
      const postDate = new Date(post.createdAt);
      const now = new Date();
      
      switch (dateRange) {
        case 'today':
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          matchesDate = postDate >= today;
          break;
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          matchesDate = postDate >= weekAgo;
          break;
        case 'month':
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          matchesDate = postDate >= monthStart;
          break;
        case 'custom':
          if (customStartDate && customEndDate) {
            matchesDate = postDate >= customStartDate && postDate <= customEndDate;
          }
          break;
      }
    }
    
    return matchesFilter && matchesSearch && matchesPage && matchesDate;
  });

  const formatDateTime = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      scheduled: "bg-blue-100 text-blue-800",
      published: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      draft: "bg-gray-100 text-gray-800",
    };
    
    return (
      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClasses[status as keyof typeof statusClasses] || statusClasses.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };



  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">All Posts</h1>
        
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Search posts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Posts</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={pageFilter} onValueChange={setPageFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by page" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pages</SelectItem>
              {accounts.map((account: any) => (
                <SelectItem key={account.id} value={account.id.toString()}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen} modal={false}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full sm:w-64 justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {(() => {
                  switch (dateRange) {
                    case 'today':
                      return 'Today';
                    case 'week':
                      return 'This Week';
                    case 'month':
                      return 'This Month';
                    case 'custom':
                      if (customStartDate && customEndDate) {
                        return `${format(customStartDate, 'MMM dd')} - ${format(customEndDate, 'MMM dd, yyyy')}`;
                      }
                      return 'Custom Range';
                    default:
                      return 'All Time';
                  }
                })()}
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-auto p-0" 
              align="start" 
              side="bottom" 
              sideOffset={4} 
              onOpenAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => {
                // Allow interaction with page elements outside the popover
                e.preventDefault();
              }}
            >
              <div className="flex">
                {/* Left sidebar with presets */}
                <div className="w-48 p-4 border-r border-gray-200 space-y-2">
                  <div className="space-y-1">
                    <div
                      className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer text-sm ${
                        dateRange === 'today' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        setDateRange('today');
                        setDatePickerOpen(false);
                      }}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        dateRange === 'today' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      } flex items-center justify-center`}>
                        {dateRange === 'today' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <span>Today</span>
                    </div>
                    
                    <div
                      className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer text-sm ${
                        dateRange === 'week' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        setDateRange('week');
                        setDatePickerOpen(false);
                      }}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        dateRange === 'week' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      } flex items-center justify-center`}>
                        {dateRange === 'week' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <span>Last 7 days</span>
                    </div>

                    <div
                      className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer text-sm ${
                        dateRange === 'month' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        setDateRange('month');
                        setDatePickerOpen(false);
                      }}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        dateRange === 'month' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      } flex items-center justify-center`}>
                        {dateRange === 'month' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <span>Last 30 days</span>
                    </div>

                    <div
                      className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer text-sm ${
                        dateRange === 'custom' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        setDateRange('custom');
                        setCustomStartDate(subDays(new Date(), 7));
                        setCustomEndDate(new Date());
                      }}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        dateRange === 'custom' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      } flex items-center justify-center`}>
                        {dateRange === 'custom' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <span>Custom</span>
                    </div>

                    <div
                      className={`flex items-center space-x-3 px-3 py-2 rounded-md cursor-pointer text-sm ${
                        dateRange === 'all' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        setDateRange('all');
                        setDatePickerOpen(false);
                      }}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        dateRange === 'all' ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      } flex items-center justify-center`}>
                        {dateRange === 'all' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <span>All Time</span>
                    </div>
                  </div>
                </div>

                {/* Right side with dual calendar for custom dates */}
                {dateRange === 'custom' && (
                  <div className="p-4">
                    <CalendarComponent
                      mode="range"
                      selected={{
                        from: customStartDate,
                        to: customEndDate
                      }}
                      onSelect={(range) => {
                        if (range?.from) setCustomStartDate(range.from);
                        if (range?.to) setCustomEndDate(range.to);
                      }}
                      numberOfMonths={2}
                      className="rounded-md"
                    />
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-xs text-gray-500">
                        {customStartDate && customEndDate ? (
                          `${format(customStartDate, 'dd MMM yyyy')} - ${format(customEndDate, 'dd MMM yyyy')}`
                        ) : customStartDate ? (
                          `${format(customStartDate, 'dd MMM yyyy')} - Select end date`
                        ) : (
                          'Select date range'
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDatePickerOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setDatePickerOpen(false)}
                          disabled={!customStartDate || !customEndDate}
                        >
                          Update
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Content
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Scheduled For
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Language
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPosts.length > 0 ? (
                filteredPosts.map((post) => (
                  <tr key={post.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {post.content}
                      </div>
                      {post.mediaUrl && (
                        <div className="text-xs text-gray-500 mt-1">
                          📎 {post.mediaType || 'Media'} attached
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                          <i className="fab fa-facebook-f text-blue-600 text-sm"></i>
                        </div>
                        <div>
                          <div className="text-sm text-gray-900">{accounts.find((acc: any) => acc.id === post.accountId)?.name || 'Unknown Account'}</div>
                          <div className="text-xs text-gray-500">Page ID: {accounts.find((acc: any) => acc.id === post.accountId)?.pageId || 'N/A'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {post.scheduledFor ? formatDateTime(post.scheduledFor) : "Not scheduled"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(post.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        post.language === 'HI' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {post.language || 'EN'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-3">
                        <button 
                          className="text-indigo-600 hover:text-indigo-900"
                          onClick={() => {
                            // Handle edit - could navigate to edit page or open modal
                            console.log('Edit post', post.id);
                          }}
                        >
                          <i className="fa-solid fa-edit"></i>
                        </button>
                        <button 
                          className="text-red-600 hover:text-red-900"
                          onClick={() => deletePostMutation.mutate(post.id)}
                          disabled={deletePostMutation.isPending}
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="text-gray-500">
                      <i className="fa-solid fa-calendar-xmark text-4xl mb-4 block"></i>
                      <p className="text-lg font-medium">No posts found</p>
                      <p className="mt-1">
                        {search || filter !== "all" 
                          ? "Try adjusting your filters or search terms."
                          : "Start by importing posts or creating new content."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {filteredPosts.length > 0 && (
          <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Showing {filteredPosts.length} of {posts.length} posts
            </div>
          </div>
        )}
      </div>
    </div>
  );
}