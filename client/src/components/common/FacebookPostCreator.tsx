import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Image, Video, MapPin, Smile, Hash, Link2, Users, Globe, Lock, TrendingUp, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FacebookAccount } from "@shared/schema";
import MediaUpload from "@/components/common/MediaUpload";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const formSchema = z.object({
  accountId: z.string().min(1, "Please select a Facebook page"),
  content: z.string().min(1, "Content is required"),
  mediaUrl: z.string().optional(),
  link: z.string().url().optional().or(z.literal("")),
  language: z.string().default("en"),
  labels: z.array(z.string()).default([]),
  scheduledFor: z.date().optional(),
  status: z.enum(["draft", "scheduled", "publish"]).default("draft"),
  collaborator: z.string().optional(),
  privacy: z.enum(["public", "restricted"]).default("public"),
  boost: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface FacebookPostCreatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FacebookPostCreator({ isOpen, onClose }: FacebookPostCreatorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isScheduleEnabled, setIsScheduleEnabled] = useState(false);

  // Fetch Facebook accounts
  const { data: accounts = [] } = useQuery<FacebookAccount[]>({
    queryKey: ['/api/facebook-accounts'],
    staleTime: 60000,
  });

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
      collaborator: "",
      privacy: "public",
      boost: false,
    },
  });

  const createPostMutation = useMutation({
    mutationFn: (values: FormValues) => {
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
      
      onClose();
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

  const onSubmit = (values: FormValues) => {
    createPostMutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-semibold">Create post</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 px-6 pb-6">
            {/* Post to Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Post to</h3>
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full h-12">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-sm font-bold">f</span>
                            </div>
                            <SelectValue placeholder="Select a Facebook page" />
                          </div>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id.toString()}>
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs font-bold">f</span>
                              </div>
                              {account.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="bg-gray-200" />

            {/* Media Section */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Media</h3>
              <p className="text-gray-600 text-sm mb-4">Share photos or a video.</p>
              
              <div className="flex gap-3 mb-4">
                <Button variant="outline" type="button" className="h-10 gap-2">
                  <Image className="w-4 h-4" />
                  Add Photo
                </Button>
                
                <Button variant="outline" type="button" className="h-10 gap-2">
                  <Video className="w-4 h-4" />
                  Add Video
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
              
              <FormField
                control={form.control}
                name="mediaUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <MediaUpload 
                        existingUrl={field.value || ""} 
                        onMediaUploaded={(url: string) => field.onChange(url)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="bg-gray-200" />

            {/* Post Details */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Post details</h3>
              
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Text</Label>
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <Textarea 
                              placeholder="What do you want to say?"
                              className="min-h-[100px] border-gray-200 resize-none pr-16"
                              {...field}
                            />
                            <div className="absolute bottom-3 right-3 flex gap-2">
                              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Hash className="w-4 h-4 text-gray-500" />
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Smile className="w-4 h-4 text-gray-500" />
                              </Button>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Action Icons */}
                <div className="flex gap-4 text-gray-500 items-center">
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Smile className="w-5 h-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MapPin className="w-5 h-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Users className="w-5 h-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Image className="w-5 h-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <TrendingUp className="w-5 h-5" />
                  </Button>
                  <FormField
                    control={form.control}
                    name="link"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input 
                            placeholder="Add link"
                            className="h-8 text-sm border-none bg-transparent"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Link2 className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </div>

            <Separator className="bg-gray-200" />

            {/* Scheduling Options */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Scheduling options</h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor="schedule-toggle" className="text-sm">Set date and time</Label>
                  <Switch
                    id="schedule-toggle"
                    checked={isScheduleEnabled}
                    onCheckedChange={setIsScheduleEnabled}
                  />
                </div>
              </div>
              
              <p className="text-gray-600 text-sm mb-4">
                Schedule your post for the times when your audience is most active, or manually select 
                a date and time in the future to publish your post.
              </p>

              {isScheduleEnabled && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-blue-600">
                    <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">f</span>
                    </div>
                    <span className="font-medium">Facebook</span>
                  </div>

                  <div className="flex gap-4">
                    <FormField
                      control={form.control}
                      name="scheduledFor"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal h-12",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {field.value ? (
                                    format(field.value, "d MMMM yyyy")
                                  ) : (
                                    <span>{format(new Date(), "d MMMM yyyy")}</span>
                                  )}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value || new Date()}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date < new Date() || date < new Date("1900-01-01")
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Input 
                      type="time"
                      defaultValue="14:17"
                      className="w-32 h-12"
                    />
                  </div>

                  <Button variant="outline" type="button" className="h-10 gap-2">
                    <div className="w-4 h-4 bg-gray-800 rounded-full"></div>
                    Active times
                  </Button>
                </div>
              )}
            </div>

            <Separator className="bg-gray-200" />

            {/* Collaborator */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-semibold">Collaborator</h3>
                <div className="w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">i</span>
                </div>
              </div>
              <p className="text-gray-600 text-sm mb-4">
                Add a collaborator to your Facebook post and they will automatically be invited.
              </p>
              
              <FormField
                control={form.control}
                name="collaborator"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input 
                        placeholder="Add a collaborator by name or URL"
                        className="h-12"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="bg-gray-200" />

            {/* Privacy Settings */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Privacy settings</h3>
              <p className="text-gray-600 text-sm mb-4">
                Adjust your privacy settings to control who can see your post in News Feed, in Watch, in 
                search results and on your profile.
              </p>
              
              <FormField
                control={form.control}
                name="privacy"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-3"
                      >
                        <div className="flex items-center space-x-3 p-3 border rounded-lg bg-blue-50 border-blue-200">
                          <RadioGroupItem value="public" id="public" />
                          <div className="flex items-center gap-3 flex-1">
                            <Globe className="w-5 h-5 text-blue-600" />
                            <div>
                              <Label htmlFor="public" className="font-medium">Public</Label>
                              <p className="text-sm text-gray-600">Anyone on or off Facebook will be able to see your post.</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3 p-3 border rounded-lg">
                          <RadioGroupItem value="restricted" id="restricted" />
                          <div className="flex items-center gap-3 flex-1">
                            <Lock className="w-5 h-5 text-gray-600" />
                            <div>
                              <Label htmlFor="restricted" className="font-medium">Restricted</Label>
                              <p className="text-sm text-gray-600">Choose certain people on Facebook who can see your post.</p>
                            </div>
                          </div>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="bg-gray-200" />

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-4">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-gray-800 rounded-full"></div>
                <FormField
                  control={form.control}
                  name="boost"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          className="w-4 h-4"
                        />
                      </FormControl>
                      <Label className="text-sm font-medium">Boost</Label>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-3">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={onClose}
                  className="px-6"
                >
                  Cancel
                </Button>
                
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => {
                    form.setValue('status', 'draft');
                    form.handleSubmit(onSubmit)();
                  }}
                  className="px-6"
                >
                  Finish later
                </Button>
                
                <Button 
                  type="submit"
                  onClick={() => form.setValue('status', isScheduleEnabled ? 'scheduled' : 'publish')}
                  disabled={createPostMutation.isPending}
                  className="px-6 bg-blue-600 hover:bg-blue-700"
                >
                  {isScheduleEnabled ? 'Schedule' : 'Publish Now'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}