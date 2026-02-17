import axiosInstance from '../utils/axiosConfig';

export const triggerOmniWorkflow = async ({ stage, event, payload = {} }) => {
  const response = await axiosInstance.post('/omi/workflow/event', {
    stage,
    event,
    payload,
  });

  return {
    ...response.data,
    stage,
    event,
    timestamp: Date.now(),
  };
};
