import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triggerOmniWorkflow } from '../services/omiWorkflowService';

const OMNI_STATE_KEY = ['omi-workflow-state'];

export const useOmniWorkflow = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: triggerOmniWorkflow,
    onSuccess: (data) => {
      // 🔥 Store latest omni response globally
      queryClient.setQueryData(OMNI_STATE_KEY, data);
    },
  });

  const trigger = ({ stage, event, payload }) => {
    mutation.mutate({ stage, event, payload });
  };

  return {
    trigger,
    isLoading: mutation.isLoading,
  };
};