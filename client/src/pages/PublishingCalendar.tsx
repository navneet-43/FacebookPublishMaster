import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardHeader from "@/components/common/DashboardHeader";
import MediaUpload from "@/components/common/MediaUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2, Image } from "lucide-react";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { FacebookAccount, Post } from "@/types";
import { useToast } from "@/hooks/use-toast";

// Define the form schema
const formSchema = z.object({
  accountId: z.string().min(1, "Facebook account is required"),
  content: z.string().min(1, "Content is required").max(5000, "Content cannot exceed 5000 characters"),
  mediaUrl: z.string().optional(),
  link: z.string().optional(),
  language: z.string().min(1, "Language is required"),
  labels: z.array(z.string()).optional(),
  scheduledFor: z.date().optional(),
  status: z.enum(["draft", "scheduled", "publish"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function PublishingCalendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Fetch Facebook accounts
  const { data: accounts = [] } = useQuery<FacebookAccount[]>({
    queryKey: ['/api/facebook-accounts'],
    staleTime: 60000,
  });

  // Fetch all posts
  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: ['/api/posts'],
    staleTime: 60000,
  });

  // Form definition
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountId: "",
      content: "",
      mediaUrl: "",
      link: "",
      language: "en",
      labels: [],
      status: "draft",
    },
  });

  const createPostMutation = useMutation({
    mutationFn: (values: FormValues) => {
      // Convert accountId from string to number
      const postData = {
        ...values,
        accountId: parseInt(values.accountId),
      };
      
      return apiRequest('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/posts/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      
      toast({
        title: "Post created",
        description: "Your post has been successfully created.",
      });
      
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error creating post",
        description: (error as Error).message || "There was an error creating your post.",
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: FormValues) {
    createPostMutation.mutate(values);
  }

  return (
    <>
      <DashboardHeader 
        title="Publishing Calendar" 
        subtitle="View and manage your scheduled content"
        showImport={true}
        importLabel="Create Post"
        onImport={() => setIsCreateDialogOpen(true)}
      />
      
      <div className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Publishing Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <i className="fa-solid fa-calendar-days text-5xl mb-4"></i>
                <p>Calendar view will be implemented in a future update.</p>
                <p className="text-sm mt-2">This page would display a calendar view of all scheduled posts.</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  Create Post
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Post Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create a New Post</DialogTitle>
            <DialogDescription>
              Create a new post for your Facebook page. Fill out the form below to create a draft, schedule, or immediately publish your post.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              {/* Facebook Account Selection */}
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Facebook Page</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a Facebook page" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem 
                            key={account.id} 
                            value={account.id.toString()}
                            disabled={!account.isActive}
                          >
                            {account.name} {!account.isActive && "(Inactive)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Post Content */}
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Write your post content here..."
                        className="min-h-[120px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Media Upload */}
              <FormField
                control={form.control}
                name="mediaUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Media Upload (Optional)</FormLabel>
                    <FormControl>
                      <MediaUpload 
                        existingUrl={field.value || ""} 
                        onMediaUploaded={(url) => {
                          field.onChange(url);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Link */}
              <FormField
                control={form.control}
                name="link"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://example.com"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Language */}
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Language</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a language" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="it">Italian</SelectItem>
                        <SelectItem value="pt">Portuguese</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Schedule Date */}
              <FormField
                control={form.control}
                name="scheduledFor"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Schedule Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            if (date) {
                              // Set time to current time
                              const now = new Date();
                              date.setHours(now.getHours(), now.getMinutes());
                            }
                            field.onChange(date);
                            // Set status to scheduled if date is selected
                            if (date) {
                              form.setValue("status", "scheduled");
                            }
                          }}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Status */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Post Status</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Save as Draft</SelectItem>
                        <SelectItem value="scheduled">Schedule for Later</SelectItem>
                        <SelectItem value="publish">Publish Now</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter className="mt-6 gap-2">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    form.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createPostMutation.isPending}
                >
                  {createPostMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Post
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
