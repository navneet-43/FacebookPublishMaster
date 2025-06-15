import { useQuery } from "@tanstack/react-query";
import { Activity } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";



export default function RecentActivityCard() {
  const { data: activities, isLoading } = useQuery<Activity[]>({
    queryKey: ['/api/activities'],
    retry: 1,
    retryDelay: 1000,
  });

  // Helper function to format the date
  const formatTime = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    
    // If it's today, show the time
    if (d.toDateString() === now.toDateString()) {
      return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // If it's yesterday
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Otherwise show the date
    return d.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric' 
    }) + ', ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper function to get icon and color for activity type
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'post_published':
        return { icon: 'fa-check', bgColor: 'bg-green-100', textColor: 'text-fb-green' };
      case 'asana_import':
      case 'asana_connected':
        return { icon: 'fa-file-import', bgColor: 'bg-blue-100', textColor: 'text-fb-blue' };
      case 'post_failed':
        return { icon: 'fa-triangle-exclamation', bgColor: 'bg-red-100', textColor: 'text-fb-error' };
      case 'account_connected':
        return { icon: 'fa-link', bgColor: 'bg-purple-100', textColor: 'text-purple-600' };
      case 'post_created':
      case 'post_updated':
        return { icon: 'fa-pencil', bgColor: 'bg-indigo-100', textColor: 'text-indigo-600' };
      case 'account_removed':
      case 'post_deleted':
        return { icon: 'fa-trash', bgColor: 'bg-red-100', textColor: 'text-fb-error' };
      default:
        return { icon: 'fa-info-circle', bgColor: 'bg-gray-100', textColor: 'text-gray-600' };
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-6 py-5 border-b border-fb-gray">
          <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        
        <CardContent className="px-6 py-5">
          <ul className="divide-y divide-gray-200">
            {Array(3).fill(0).map((_, i) => (
              <li key={i} className="py-3">
                <div className="flex items-start">
                  <Skeleton className="h-8 w-8 rounded-full mt-1" />
                  <div className="ml-3 flex-1">
                    <Skeleton className="h-4 w-40 mb-1" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          
          <div className="mt-4 text-center">
            <Skeleton className="h-4 w-32 mx-auto" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="px-6 py-5 border-b border-fb-gray">
        <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      
      <CardContent className="px-6 py-5">
        <ul className="divide-y divide-gray-200">
          {activities && activities.length > 0 ? (
            activities.map((activity) => {
              const { icon, bgColor, textColor } = getActivityIcon(activity.type);
              return (
                <li key={activity.id} className="py-3">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mt-1">
                      <div className={`h-8 w-8 rounded-full ${bgColor} flex items-center justify-center ${textColor}`}>
                        <i className={`fa-solid ${icon}`}></i>
                      </div>
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm text-gray-900">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-500">{activity.createdAt ? formatTime(activity.createdAt) : ''}</p>
                        {activity.metadata && (activity.type === 'post_published' || activity.type === 'bulk_import') && (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            {(activity.metadata as any)?.language && (
                              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                {String((activity.metadata as any).language).toUpperCase()}
                              </span>
                            )}
                            {(activity.metadata as any)?.customLabels && Array.isArray((activity.metadata as any).customLabels) && (activity.metadata as any).customLabels.length > 0 && (
                              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                {((activity.metadata as any).customLabels as string[]).join(', ')}
                              </span>
                            )}
                            {(activity.metadata as any)?.labels && (activity.metadata as any).labels.trim() !== '' && (
                              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                {String((activity.metadata as any).labels)}
                              </span>
                            )}
                            {(activity.metadata as any)?.mediaType && (activity.metadata as any).mediaType !== 'none' && (
                              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                                {String((activity.metadata as any).mediaType)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })
          ) : (
            <li className="py-4 text-center text-sm text-gray-500">
              No recent activity found.
            </li>
          )}
        </ul>
        
        <div className="mt-4 text-center">
          <Button variant="link" className="text-fb-blue">
            View All Activity
            <i className="fa-solid fa-arrow-right ml-1"></i>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
