import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Calendar, Download, Filter, ExternalLink, CheckCircle, XCircle, Clock, CalendarIcon } from 'lucide-react';
import { format, parseISO, isValid, subDays, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from 'date-fns';

interface ReportPost {
  id: number;
  content: string;
  createdAt: string;
  publishedAt: string | null;
  status: 'scheduled' | 'published' | 'failed';
  errorMessage: string | null;
  labels: string[];
  language: string;
  mediaType: string | null;
  accountName: string;
  pageId: string;
  facebookPostId: string | null;
}

interface ReportFilters {
  dateRange: 'all' | 'today' | 'week' | 'month' | 'custom';
  status: 'all' | 'published' | 'failed' | 'scheduled';
  account: string;
  contentBucket: string;
  customStartDate?: Date;
  customEndDate?: Date;
}

export default function ReportsPage() {
  const [filters, setFilters] = useState<ReportFilters>({
    dateRange: 'all',
    status: 'all',
    account: 'all',
    contentBucket: 'all'
  });

  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  // Fetch posts data for reports
  const { data: posts = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/reports/posts', filters, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== 'all' && key !== 'customStartDate' && key !== 'customEndDate') {
          params.append(key, value as string);
        }
      });
      
      // Handle custom date range
      if (filters.dateRange === 'custom' && filters.customStartDate && filters.customEndDate) {
        params.append('startDate', filters.customStartDate.toISOString());
        params.append('endDate', filters.customEndDate.toISOString());
      }
      
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await fetch(`/api/reports/posts?${params}`);
      if (!response.ok) throw new Error('Failed to fetch reports');
      return response.json();
    }
  });

  // Fetch accounts for filter dropdown
  const { data: accounts = [] } = useQuery({
    queryKey: ['/api/facebook-accounts'],
    queryFn: async () => {
      const response = await fetch('/api/facebook-accounts');
      if (!response.ok) throw new Error('Failed to fetch accounts');
      return response.json();
    }
  });

  // Fetch custom labels for content bucket filter
  const { data: customLabels = [] } = useQuery({
    queryKey: ['/api/custom-labels'],
    queryFn: async () => {
      const response = await fetch('/api/custom-labels');
      if (!response.ok) throw new Error('Failed to fetch custom labels');
      return response.json();
    }
  });

  // Get unique content buckets from posts
  const contentBuckets = Array.from(new Set(
    posts.flatMap((post: ReportPost) => post.labels || [])
  )).filter(Boolean);

  // Since filtering is done on backend, just use posts directly
  const filteredPosts = posts;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      const date = parseISO(dateString);
      return isValid(date) ? format(date, 'MMM dd, yyyy HH:mm') : '-';
    } catch {
      return '-';
    }
  };

  const getStatusBadge = (status: string, errorMessage: string | null) => {
    switch (status) {
      case 'published':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Published</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'scheduled':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Scheduled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPublishedLink = (facebookPostId: string | null, pageId: string) => {
    if (!facebookPostId) return '-';
    const url = `https://facebook.com/${facebookPostId}`;
    return (
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        View Post <ExternalLink className="w-3 h-3" />
      </a>
    );
  };

  const handleDateRangeChange = (preset: string) => {
    const now = new Date();
    
    switch (preset) {
      case 'today':
        setFilters(prev => ({ ...prev, dateRange: 'today' }));
        break;
      case 'week':
        setFilters(prev => ({ ...prev, dateRange: 'week' }));
        break;
      case 'month':
        setFilters(prev => ({ ...prev, dateRange: 'month' }));
        break;
      case 'custom':
        setFilters(prev => ({ 
          ...prev, 
          dateRange: 'custom',
          customStartDate: subDays(now, 7),
          customEndDate: now
        }));
        setDatePickerOpen(true);
        break;
      default:
        setFilters(prev => ({ ...prev, dateRange: 'all' }));
    }
  };

  const handleCustomDateChange = (startDate: Date | undefined, endDate: Date | undefined) => {
    setFilters(prev => ({
      ...prev,
      customStartDate: startDate,
      customEndDate: endDate
    }));
  };

  const getDateRangeText = () => {
    switch (filters.dateRange) {
      case 'today':
        return 'Today';
      case 'week':
        return 'This Week';
      case 'month':
        return 'This Month';
      case 'custom':
        if (filters.customStartDate && filters.customEndDate) {
          return `${format(filters.customStartDate, 'MMM dd')} - ${format(filters.customEndDate, 'MMM dd, yyyy')}`;
        }
        return 'Custom Range';
      default:
        return 'All Time';
    }
  };

  const exportToCsv = () => {
    const headers = ['Date Uploaded', 'Date Published', 'Published Page', 'Content Bucket', 'Published Link', 'Content', 'Status'];
    const csvData = [
      headers,
      ...filteredPosts.map((post: ReportPost) => [
        formatDate(post.createdAt),
        formatDate(post.publishedAt),
        post.accountName,
        (post.labels || []).join(', '),
        post.facebookPostId ? `https://facebook.com/${post.facebookPostId}` : '',
        `"${post.content.replace(/"/g, '""')}"`,
        post.status
      ])
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `publishing-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const stats = {
    total: filteredPosts.length,
    published: filteredPosts.filter((p: ReportPost) => p.status === 'published').length,
    failed: filteredPosts.filter((p: ReportPost) => p.status === 'failed').length,
    scheduled: filteredPosts.filter((p: ReportPost) => p.status === 'scheduled').length
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Publishing Reports</h1>
          <p className="text-gray-600">Track your content publishing performance and analytics</p>
        </div>
        <Button onClick={exportToCsv} className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Posts</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Published</p>
                <p className="text-2xl font-bold text-green-600">{stats.published}</p>
              </div>
              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Failed</p>
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              </div>
              <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Scheduled</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.scheduled}</p>
              </div>
              <div className="h-8 w-8 bg-yellow-100 rounded-full flex items-center justify-center">
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium">Date Range</label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {getDateRangeText()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-4 space-y-3">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Quick Presets</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant={filters.dateRange === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            handleDateRangeChange('all');
                            setDatePickerOpen(false);
                          }}
                        >
                          All Time
                        </Button>
                        <Button
                          variant={filters.dateRange === 'today' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            handleDateRangeChange('today');
                            setDatePickerOpen(false);
                          }}
                        >
                          Today
                        </Button>
                        <Button
                          variant={filters.dateRange === 'week' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            handleDateRangeChange('week');
                            setDatePickerOpen(false);
                          }}
                        >
                          This Week
                        </Button>
                        <Button
                          variant={filters.dateRange === 'month' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => {
                            handleDateRangeChange('month');
                            setDatePickerOpen(false);
                          }}
                        >
                          This Month
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">Custom Range</h4>
                      <Button
                        variant={filters.dateRange === 'custom' ? 'default' : 'outline'}
                        size="sm"
                        className="w-full"
                        onClick={() => handleDateRangeChange('custom')}
                      >
                        Select Custom Dates
                      </Button>
                    </div>

                    {filters.dateRange === 'custom' && (
                      <div className="space-y-3 pt-3 border-t">
                        <div>
                          <label className="text-sm font-medium mb-2 block">Select Date Range</label>
                          <CalendarComponent
                            mode="range"
                            selected={{
                              from: filters.customStartDate,
                              to: filters.customEndDate
                            }}
                            onSelect={(range) => {
                              if (range) {
                                handleCustomDateChange(range.from, range.to);
                              }
                            }}
                            className="rounded-md border"
                          />
                          <div className="text-xs text-gray-500 mt-2">
                            {filters.customStartDate && filters.customEndDate ? (
                              `Selected: ${format(filters.customStartDate, 'MMM dd, yyyy')} - ${format(filters.customEndDate, 'MMM dd, yyyy')}`
                            ) : filters.customStartDate ? (
                              `Start: ${format(filters.customStartDate, 'MMM dd, yyyy')} (select end date)`
                            ) : (
                              'Click dates to select range'
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => setDatePickerOpen(false)}
                          disabled={!filters.customStartDate || !filters.customEndDate}
                        >
                          Apply Custom Range
                        </Button>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={filters.status} onValueChange={(value: any) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Account</label>
              <Select value={filters.account} onValueChange={(value: any) => setFilters(prev => ({ ...prev, account: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map((account: any) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Content Bucket</label>
              <Select value={filters.contentBucket} onValueChange={(value: any) => setFilters(prev => ({ ...prev, contentBucket: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Buckets</SelectItem>
                  {contentBuckets.map((bucket) => (
                    <SelectItem key={bucket as string} value={bucket as string}>
                      {bucket as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Search Content</label>
              <Input
                placeholder="Search posts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Publishing Bucket Report</CardTitle>
          <CardDescription>
            Detailed report showing upload dates, publish dates, pages, content buckets, and published links
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date Uploaded</TableHead>
                    <TableHead>Date Published</TableHead>
                    <TableHead>Published Page</TableHead>
                    <TableHead>Content Bucket</TableHead>
                    <TableHead>Published Link</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPosts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No posts found matching your criteria
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPosts.map((post: ReportPost) => (
                      <TableRow key={post.id}>
                        <TableCell className="font-medium">
                          {formatDate(post.createdAt)}
                        </TableCell>
                        <TableCell>
                          {post.status === 'published' ? formatDate(post.publishedAt) : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{post.accountName}</span>
                            <span className="text-xs text-gray-500">{post.language.toUpperCase()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(post.labels || []).length > 0 ? (
                              post.labels.map((label, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {label}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getPublishedLink(post.facebookPostId, post.pageId)}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate" title={post.content}>
                            {post.content}
                          </div>
                          {post.mediaType && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {post.mediaType}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(post.status, post.errorMessage)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}