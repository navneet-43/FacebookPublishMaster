import { useQuery } from "@tanstack/react-query";

export function usePlatformAuth() {
  const { data: authStatus, isLoading, error } = useQuery({
    queryKey: ['/api/platform/auth/status'],
    retry: false,
  });

  return {
    user: (authStatus as any)?.user || null,
    isLoading,
    isAuthenticated: (authStatus as any)?.isAuthenticated || false,
    error
  };
}