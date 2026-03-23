import axiosInstance from '../utils/axiosConfig';

const upgradeToExplorer = async () => {
  const response = await axiosInstance.post('/auth/upgrade');
  return response.data;
};

const contactEnterprise = async () => {
  const response = await axiosInstance.post('/auth/contact-enterprise');
  return response.data;
};

export default { upgradeToExplorer, contactEnterprise };
