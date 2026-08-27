// hooks/usePersonaLibrary.js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { personaLibraryService } from '../services/personaLibraryService';
import { personaKeys } from './usePersonaBuilder';

export const personaLibraryKeys = {
  all: ['persona-library'],
  list: (workspaceId, filters) =>
    [...personaLibraryKeys.all, 'list', { workspaceId, ...(filters || {}) }],
  detail: (workspaceId, personaId) =>
    [...personaLibraryKeys.all, 'detail', { workspaceId, personaId }],
};

export const usePersonaLibrary = (workspaceId, filters = {}, options = {}) =>
  useQuery({
    queryKey: personaLibraryKeys.list(workspaceId, filters),
    queryFn: () => personaLibraryService.getLibrary(workspaceId, filters),
    enabled: !!workspaceId,
    ...options,
  });

export const usePersonaLibraryItem = (workspaceId, personaId, options = {}) =>
  useQuery({
    queryKey: personaLibraryKeys.detail(workspaceId, personaId),
    queryFn: () => personaLibraryService.getLibraryItem(workspaceId, personaId),
    enabled: !!(workspaceId && personaId),
    ...options,
  });

/**
 * Reuse selected library personas in an exploration.
 *
 * On success both the persona list and the quota are invalidated: the copies
 * count toward the exploration's limit, so PersonaBuilder must refetch both or
 * its "Create New Persona" affordance and the generator's remaining-slot
 * arithmetic would be working from stale numbers. The library list is
 * invalidated too, so the copies' `already_imported` flags stay accurate.
 */
export const useImportPersonasFromLibrary = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourcePersonaIds) =>
      personaLibraryService.importFromLibrary(workspaceId, explorationId, sourcePersonaIds),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: personaKeys.list(workspaceId, explorationId),
      });
      queryClient.invalidateQueries({
        queryKey: personaKeys.quota(workspaceId, explorationId),
      });
      queryClient.invalidateQueries({ queryKey: personaLibraryKeys.all });
    },
  });
};
