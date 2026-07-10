const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

export const API_BASE_URL = trimTrailingSlash(
  process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000'
);

export const API = `${API_BASE_URL}/api`;
export const SOCKET_URL = API_BASE_URL;
