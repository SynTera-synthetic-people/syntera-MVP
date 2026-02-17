import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workspaceService } from '../services/workspaceService';
import { toast } from 'react-toastify';

export const workspaceKeys = {
  all: ['workspaces'],
  lists: () => [...workspaceKeys.all, 'list'],
  list: (filters) => [...workspaceKeys.lists(), filters],
  details: () => [...workspaceKeys.all, 'detail'],
  detail: (id) => [...workspaceKeys.details(), id],
};

export const useWorkspaces = (options = {}) => {
  return useQuery({
    queryKey: workspaceKeys.lists(),
    queryFn: async () => {
      const response = await workspaceService.getAll();
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false, // Prevent unwanted refetches
    ...options,
  });
};

export const useWorkspace = (workspaceId, options = {}) => {
  return useQuery({
    queryKey: workspaceKeys.detail(workspaceId),
    queryFn: async () => {
      const response = await workspaceService.getById(workspaceId);
      return response.data;
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    ...options,
  });
};

export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workspaceData) => workspaceService.create(workspaceData),
    onSuccess: (response) => {
      // Invalidate and refetch workspaces list
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.lists(),
        refetchType: 'all' // Force refetch
      });
      toast.success(response.message || 'Workspace created successfully');
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Failed to create workspace');
    },
  });
};

export const useUpdateWorkspace = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => workspaceService.update(id, data),
    onSuccess: (response, variables) => {
      // 1. Update the specific workspace cache
      queryClient.setQueryData(
        workspaceKeys.detail(variables.id),
        (oldData) => ({
          ...oldData,
          ...response.data,
        })
      );

      // 2. Update workspaces list cache
      queryClient.setQueryData(
        workspaceKeys.lists(),
        (oldData) => {
          if (!oldData) return oldData;
          return oldData.map(workspace =>
            workspace.id === variables.id
              ? { ...workspace, ...response.data }
              : workspace
          );
        }
      );

      // 3. Force a background refetch of workspaces list
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.lists(),
        refetchType: 'active' // Only refetch active queries
      });

      // 4. Invalidate the specific workspace query for next access
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.detail(variables.id),
        refetchType: 'active'
      });

      toast.success(response.message || 'Workspace updated successfully');
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Failed to update workspace');
    },
    ...options,
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workspaceId) => workspaceService.delete(workspaceId),
    onSuccess: (response, workspaceId) => {
      // Remove the deleted workspace from cache
      queryClient.removeQueries({
        queryKey: workspaceKeys.detail(workspaceId)
      });

      // Update workspaces list cache by filtering out deleted workspace
      queryClient.setQueryData(
        workspaceKeys.lists(),
        (oldData) => {
          if (!oldData) return oldData;
          return oldData.filter(workspace => workspace.id !== workspaceId);
        }
      );

      // Force a background refetch of workspaces list
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.lists(),
        refetchType: 'active'
      });

      toast.success(response.message || 'Workspace deleted successfully');
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Failed to delete workspace');
    },
  });
};