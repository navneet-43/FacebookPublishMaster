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
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { CalendarIcon, Loader2, Image, Clock, X, Check, ChevronsUpDown } from "lucide-react";
import { format, addHours, setHours, setMinutes } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { FacebookAccount, Post, CustomLabel } from "@/types";
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
  scheduledTime: z.string().optional(),
  crosspost: z.boolean().default(false),
  crosspostTo: z.array(z.string()).optional(),
  status: z.enum(["draft", "scheduled", "publish"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function PublishingCalendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labelSearchTerm, setLabelSearchTerm] = useState('');

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

  // Fetch custom labels
  const { data: customLabels = [] } = useQuery<CustomLabel[]>({
    queryKey: ['/api/custom-labels'],
    staleTime: 60000,
  });

  // Default date with time at current hour
  const defaultDate = new Date();
  defaultDate.setMinutes(0);
  defaultDate.setSeconds(0);
  
  // Format time in HH:MM format
  const formatTimeForInput = (date: Date) => {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

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
      scheduledFor: undefined,
      scheduledTime: formatTimeForInput(defaultDate),
      crosspost: false,
      crosspostTo: [],
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
    // Process the form data before submission
    const processedValues = { ...values };
    
    // If we have a date and time, combine them
    if (values.scheduledFor && values.scheduledTime) {
      const [hours, minutes] = values.scheduledTime.split(':').map(Number);
      const date = new Date(values.scheduledFor);
      date.setHours(hours, minutes, 0, 0);
      processedValues.scheduledFor = date;
    }
    
    // Handle crossposting
    if (!values.crosspost) {
      processedValues.crosspostTo = [];
    }
    
    createPostMutation.mutate(processedValues);
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
              
              {/* Custom Labels */}
              <FormField
                control={form.control}
                name="labels"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Custom Labels</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between",
                              !field.value?.length && "text-muted-foreground"
                            )}
                          >
                            {field.value?.length
                              ? `${field.value.length} label${field.value.length > 1 ? "s" : ""} selected`
                              : "Select labels"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-0">
                        <Command>
                          <CommandInput placeholder="Search labels..." />
                          <CommandEmpty>No labels found.</CommandEmpty>
                          <CommandGroup>
                            {customLabels.map((label) => (
                              <CommandItem
                                key={label.id}
                                value={label.name}
                                onSelect={() => {
                                  const labelId = label.id.toString();
                                  const selectedLabels = field.value || [];
                                  const newLabels = selectedLabels.includes(labelId)
                                    ? selectedLabels.filter((id) => id !== labelId)
                                    : [...selectedLabels, labelId];
                                  field.onChange(newLabels);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <Badge style={{ backgroundColor: label.color }} className="h-4 w-4 rounded-full p-0" />
                                  {label.name}
                                </div>
                                <Check
                                  className={cn(
                                    "ml-auto h-4 w-4",
                                    field.value?.includes(label.id.toString()) ? "opacity-100" : "opacity-0"
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                    {Array.isArray(field.value) && field.value.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {field.value.map((labelId) => {
                          const label = customLabels.find((l) => l.id.toString() === labelId);
                          return label ? (
                            <Badge
                              key={label.id}
                              style={{ backgroundColor: label.color }}
                              className="px-2 py-1 text-white"
                            >
                              {label.name}
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-4 w-4 p-0 ml-1"
                                onClick={() => {
                                  field.onChange(
                                    Array.isArray(field.value) 
                                      ? field.value.filter((id) => id !== labelId) 
                                      : []
                                  );
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
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
              
              {/* Schedule Time */}
              <FormField
                control={form.control}
                name="scheduledTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule Time</FormLabel>
                    <div className="flex items-center space-x-2">
                      <FormControl>
                        <Input
                          type="time"
                          {...field}
                          className="w-full"
                        />
                      </FormControl>
                      <Clock className="h-4 w-4 opacity-50" />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Crosspost option */}
              <FormField
                control={form.control}
                name="crosspost"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Crosspost to other pages
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Post the same content to multiple Facebook pages
                      </p>
                    </div>
                  </FormItem>
                )}
              />
              
              {/* Crosspost account selection */}
              {form.watch("crosspost") && (
                <FormField
                  control={form.control}
                  name="crosspostTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Pages for Crossposting</FormLabel>
                      <div className="space-y-2">
                        {accounts
                          .filter(account => account.id.toString() !== form.watch("accountId") && account.isActive)
                          .map(account => (
                            <div key={account.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`crosspost-${account.id}`}
                                checked={field.value?.includes(account.id.toString())}
                                onCheckedChange={(checked) => {
                                  const accountId = account.id.toString();
                                  const currentValues = field.value || [];
                                  const newValues = checked
                                    ? [...currentValues, accountId]
                                    : currentValues.filter(id => id !== accountId);
                                  field.onChange(newValues);
                                }}
                              />
                              <label
                                htmlFor={`crosspost-${account.id}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {account.name}
                              </label>
                            </div>
                          ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
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
