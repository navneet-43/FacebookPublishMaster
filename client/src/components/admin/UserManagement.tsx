import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Users, UserPlus, Settings, Shield, Key, Mail, User, Calendar, CheckCircle, XCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

interface PlatformUser {
  id: number;
  fullName: string;
  email: string;
  role: 'admin' | 'user';
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

interface CreateUserResponse {
  message: string;
  user: PlatformUser & { tempPassword: string };
}

interface ResetPasswordResponse {
  message: string;
  tempPassword: string;
}

const createUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['user', 'admin']).default('user'),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').optional(),
  email: z.string().email('Invalid email address').optional(),
  role: z.enum(['user', 'admin']).optional(),
  isActive: z.boolean().optional(),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;
type UpdateUserFormData = z.infer<typeof updateUserSchema>;

export function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);

  // Fetch users
  const { data: users, isLoading } = useQuery({
    queryKey: ['/api/auth/admin/users'],
    queryFn: () => apiRequest('/api/auth/admin/users') as Promise<PlatformUser[]>,
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (userData: CreateUserFormData) =>
      apiRequest('/api/auth/admin/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      }) as Promise<CreateUserResponse>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/admin/users'] });
      setIsCreateDialogOpen(false);
      toast({
        title: 'User created successfully',
        description: `Temporary password: ${data.user.tempPassword}`,
      });
      createUserForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Error creating user',
        description: error.message || 'Failed to create user',
        variant: 'destructive',
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserFormData }) =>
      apiRequest(`/api/auth/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/admin/users'] });
      setEditingUser(null);
      toast({
        title: 'User updated successfully',
      });
      updateUserForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Error updating user',
        description: error.message || 'Failed to update user',
        variant: 'destructive',
      });
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: (userId: number) =>
      apiRequest(`/api/auth/admin/users/${userId}/reset-password`, {
        method: 'POST',
      }) as Promise<ResetPasswordResponse>,
    onSuccess: (data) => {
      toast({
        title: 'Password reset successfully',
        description: `New temporary password: ${data.tempPassword}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error resetting password',
        description: error.message || 'Failed to reset password',
        variant: 'destructive',
      });
    },
  });

  // Forms
  const createUserForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      role: 'user',
    },
  });

  const updateUserForm = useForm<UpdateUserFormData>({
    resolver: zodResolver(updateUserSchema),
  });

  // Set form values when editing user
  useEffect(() => {
    if (editingUser) {
      updateUserForm.reset({
        fullName: editingUser.fullName,
        email: editingUser.email,
        role: editingUser.role,
        isActive: editingUser.isActive,
      });
    }
  }, [editingUser, updateUserForm]);

  const handleCreateUser = (data: CreateUserFormData) => {
    createUserMutation.mutate(data);
  };

  const handleUpdateUser = (data: UpdateUserFormData) => {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, data });
    }
  };

  const handleResetPassword = (userId: number) => {
    if (confirm('Are you sure you want to reset this user\'s password?')) {
      resetPasswordMutation.mutate(userId);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6" />
            User Management
          </h2>
          <p className="text-gray-600 mt-1">Manage platform users and permissions</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new user to the platform. They will receive a temporary password.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={createUserForm.handleSubmit(handleCreateUser)} className="space-y-4">
              <div>
                <Label htmlFor="create-fullName">Full Name</Label>
                <Input
                  id="create-fullName"
                  {...createUserForm.register('fullName')}
                  className={createUserForm.formState.errors.fullName ? 'border-red-500' : ''}
                />
                {createUserForm.formState.errors.fullName && (
                  <p className="text-sm text-red-600">{createUserForm.formState.errors.fullName.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="create-email">Email Address</Label>
                <Input
                  id="create-email"
                  type="email"
                  {...createUserForm.register('email')}
                  className={createUserForm.formState.errors.email ? 'border-red-500' : ''}
                />
                {createUserForm.formState.errors.email && (
                  <p className="text-sm text-red-600">{createUserForm.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="create-role">Role</Label>
                <Select
                  value={createUserForm.watch('role')}
                  onValueChange={(value) => createUserForm.setValue('role', value as 'user' | 'admin')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Platform Users</CardTitle>
          <CardDescription>
            {users?.length || 0} total users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((user: PlatformUser) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium">{user.fullName}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role === 'admin' && <Shield className="h-3 w-3 mr-1" />}
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'default' : 'destructive'} className="flex items-center gap-1 w-fit">
                      {user.isActive ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.lastLoginAt ? (
                      <div className="text-sm flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        {new Date(user.lastLoginAt).toLocaleDateString()}
                      </div>
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingUser(user)}
                      >
                        <Settings className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetPassword(user.id)}
                        disabled={resetPasswordMutation.isPending}
                      >
                        <Key className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and permissions.
            </DialogDescription>
          </DialogHeader>
          
          {editingUser && (
            <form onSubmit={updateUserForm.handleSubmit(handleUpdateUser)} className="space-y-4">
              <div>
                <Label htmlFor="update-fullName">Full Name</Label>
                <Input
                  id="update-fullName"
                  {...updateUserForm.register('fullName')}
                  className={updateUserForm.formState.errors.fullName ? 'border-red-500' : ''}
                />
                {updateUserForm.formState.errors.fullName && (
                  <p className="text-sm text-red-600">{updateUserForm.formState.errors.fullName.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="update-email">Email Address</Label>
                <Input
                  id="update-email"
                  type="email"
                  {...updateUserForm.register('email')}
                  className={updateUserForm.formState.errors.email ? 'border-red-500' : ''}
                />
                {updateUserForm.formState.errors.email && (
                  <p className="text-sm text-red-600">{updateUserForm.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="update-role">Role</Label>
                <Select
                  value={updateUserForm.watch('role')}
                  onValueChange={(value) => updateUserForm.setValue('role', value as 'user' | 'admin')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="update-isActive"
                  {...updateUserForm.register('isActive')}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="update-isActive">Account is active</Label>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingUser(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateUserMutation.isPending}>
                  {updateUserMutation.isPending ? 'Updating...' : 'Update User'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}