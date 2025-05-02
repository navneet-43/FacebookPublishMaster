import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Post } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function UpcomingPostsCard() {
  const { toast } = useToast();
  const { data: posts, isLoading } = useQuery<Post[]>({
    queryKey: ['/api/posts/upcoming'],
  });

  const deletePostMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      toast({
        title: "Post deleted",
        description: "The post has been successfully deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete post: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });

  // Helper function to format the date
  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    
    // Check if it's today
    if (d.toDateString() === now.toDateString()) {
      return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Check if it's tomorrow
    if (d.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Otherwise return day of week + time
    return `${d.toLocaleDateString([], { weekday: 'short' })}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  // Helper function to determine post icon
  const getPostIcon = (post: Post) => {
    if (post.mediaUrl) return "fa-image";
    if (post.link) return "fa-link";
    return "fa-font";
  };

  const handleEdit = (postId: number) => {
    // In a real application, this would open an edit modal or navigate to an edit page
    toast({
      title: "Edit post",
      description: `Editing post ${postId} - This feature is not implemented in the demo.`,
    });
  };

  const handleDelete = (postId: number) => {
    if (confirm("Are you sure you want to delete this post?")) {
      deletePostMutation.mutate(postId);
    }
  };

  const getLabelColorClass = (label: string) => {
    const labelColors: Record<string, string> = {
      'Fashion': 'bg-blue-100 text-blue-800',
      'Blog': 'bg-green-100 text-green-800',
      'Promotion': 'bg-red-100 text-red-800',
      'News': 'bg-yellow-100 text-yellow-800',
      'Event': 'bg-indigo-100 text-indigo-800',
    };
    
    return labelColors[label] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow col-span-1 lg:col-span-2">
        <div className="px-6 py-5 border-b border-fb-gray flex justify-between items-center">
          <h3 className="text-lg font-semibold">Upcoming Posts</h3>
          <div className="flex">
            <Button variant="ghost" size="icon" className="mr-2">
              <i className="fa-solid fa-filter"></i>
            </Button>
            <Button variant="ghost" size="icon">
              <i className="fa-solid fa-ellipsis-vertical"></i>
            </Button>
          </div>
        </div>
        
        <div className="p-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                  <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                  <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                  <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array(3).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Skeleton className="h-10 w-10 rounded" />
                        <div className="ml-4">
                          <Skeleton className="h-4 w-40 mb-2" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-4 w-24 ml-2" />
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <Skeleton className="h-5 w-5" />
                        <Skeleton className="h-5 w-5" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow col-span-1 lg:col-span-2">
      <div className="px-6 py-5 border-b border-fb-gray flex justify-between items-center">
        <h3 className="text-lg font-semibold">Upcoming Posts</h3>
        <div className="flex">
          <Button variant="ghost" size="icon" className="mr-2">
            <i className="fa-solid fa-filter"></i>
          </Button>
          <Button variant="ghost" size="icon">
            <i className="fa-solid fa-ellipsis-vertical"></i>
          </Button>
        </div>
      </div>
      
      <div className="p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-3 py-3 bg-fb-light-gray text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {posts && posts.length > 0 ? (
                posts.map((post) => (
                  <tr key={post.id}>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                          <i className={`fa-solid ${getPostIcon(post)} text-gray-400`}></i>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{post.content}</div>
                          <div className="text-xs text-gray-500">
                            {post.labels && Array.isArray(post.labels) && post.labels.map((label, index) => (
                              <span key={index} className={`${getLabelColorClass(label)} text-xs font-medium mr-1 px-2 py-0.5 rounded`}>{label}</span>
                            ))}
                            <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-0.5 rounded">{post.language}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-fb-blue flex items-center justify-center text-white">
                          <i className="fa-brands fa-facebook-f"></i>
                        </div>
                        <div className="ml-2 text-sm text-gray-900">Facebook Page</div>
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{post.scheduledFor ? formatDate(post.scheduledFor) : 'Not scheduled'}</div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      {post.status === 'scheduled' && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Scheduled
                        </span>
                      )}
                      {post.status === 'draft' && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800">
                          Draft
                        </span>
                      )}
                      {post.status === 'published' && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Published
                        </span>
                      )}
                      {post.status === 'failed' && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-3">
                        <button 
                          className="text-gray-500 hover:text-gray-700" 
                          onClick={() => handleEdit(post.id)}
                          title="Edit"
                        >
                          <i className="fa-solid fa-pencil"></i>
                        </button>
                        <button 
                          className="text-gray-500 hover:text-fb-error" 
                          onClick={() => handleDelete(post.id)}
                          title="Delete"
                        >
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-gray-500">
                    No upcoming posts found. Import content from Asana or create new posts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-center mt-4">
          <Button variant="link" className="text-fb-blue">
            View All Scheduled Posts
            <i className="fa-solid fa-arrow-right ml-1"></i>
          </Button>
        </div>
      </div>
    </div>
  );
}
