import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { explorationService } from '../services/explorationService';
import { toast } from 'react-toastify';

export const explorationKeys = {
  all: ['explorations'],
  lists: (workspaceId) => [...explorationKeys.all, 'list', workspaceId],
  list: (filters) => [...explorationKeys.lists(), filters],
  details: () => [...explorationKeys.all, 'detail'],
  detail: (id) => [...explorationKeys.details(), id],
  traceability: (workspaceId, explorationId) => [...explorationKeys.all, 'traceability', workspaceId, explorationId],
};

export const useTraceability = (workspaceId, explorationId, params, options = {}) => {
  return useQuery({
    queryKey: [...explorationKeys.traceability(workspaceId, explorationId), params],
    queryFn: async () => {
      const response = await explorationService.getTraceability(workspaceId, explorationId, params);
      return response;
    },
    enabled: !!workspaceId && !!explorationId && !!params,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
};

export const useExplorations = (workspaceId, options = {}) => {
  return useQuery({
    queryKey: explorationKeys.lists(workspaceId),
    queryFn: async () => {
      const response = await explorationService.getAll(workspaceId);
      return response;
    },
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    retry: 1,
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Failed to fetch explorations');
    },
    ...options,
  });
};

export const useExploration = (explorationId, options = {}) => {
  return useQuery({
    queryKey: explorationKeys.detail(explorationId),
    queryFn: async () => {
      const response = await explorationService.getById(explorationId);
      return response;
    },
    enabled: !!explorationId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Failed to fetch exploration');
    },
    ...options,
  });
};

export const useCreateExploration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (explorationData) => explorationService.create(explorationData),
    onSuccess: (response, explorationData) => {
      // Invalidate ALL lists or specific workspace list
      queryClient.invalidateQueries({
        queryKey: explorationKeys.all
      });
      // OR be more specific:
      queryClient.invalidateQueries({
        queryKey: explorationKeys.lists(explorationData.workspace_id)
      });
      toast.success(response.message || 'Exploration created successfully');
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Failed to create exploration');
    },
  });
};

export const useUpdateExploration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => explorationService.update(id, data),
    onSuccess: (response, variables) => {
      queryClient.setQueryData(explorationKeys.detail(variables.id), response);
      queryClient.invalidateQueries({ queryKey: explorationKeys.lists() });
      toast.success(response.message || 'exploration updated successfully');
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Failed to update exploration');
    },
  });
};

export const useUpdateExplorationMethod = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => explorationService.updateMethod(id, data),
    onSuccess: (response, variables) => {
      queryClient.setQueryData(explorationKeys.detail(variables.id), response);
      queryClient.invalidateQueries({ queryKey: explorationKeys.lists() });
      toast.success(response.message || 'Research method updated successfully');
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Failed to update research method');
    },
  });
};

export const useDeleteExploration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (explorationId) => explorationService.delete(explorationId),
    onSuccess: (response, explorationId) => {
      // Force invalidate ALL exploration-related queries
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.includes('explorations')
      });
      toast.success(response.message || 'Exploration deleted successfully');
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || 'Failed to delete exploration');
    },
  });
};