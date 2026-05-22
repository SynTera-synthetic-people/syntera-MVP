import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react'; //
import { triggerOmniWorkflow } from '../services/omiWorkflowService';

const OMNI_STATE_KEY = ['omi-workflow-state'];

export const useOmniWorkflow = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: triggerOmniWorkflow,
    onSuccess: (data) => {
      queryClient.setQueryData(OMNI_STATE_KEY, data);
    },
  });

  // ✅ FIX: Memoize trigger
  const trigger = useCallback(({ stage, event, payload }) => {
    mutation.mutate({ stage, event, payload });
  }, [mutation]); // or [] also works if mutation is stable

  return {
    trigger,
    isLoading: mutation.isLoading,
  };
};