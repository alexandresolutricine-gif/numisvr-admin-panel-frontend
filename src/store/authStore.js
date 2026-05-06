import { create } from 'zustand';

const useAuthStore = create((set) => ({
  token: localStorage.getItem('nuvr-admin-token') || '',
  admin: JSON.parse(localStorage.getItem('nuvr-admin-info') || 'null'),

  setSession: (token, admin) => {
    localStorage.setItem('nuvr-admin-token', token);
    localStorage.setItem('nuvr-admin-info', JSON.stringify(admin));
    set({ token, admin });
  },

  logout: () => {
    localStorage.removeItem('nuvr-admin-token');
    localStorage.removeItem('nuvr-admin-info');
    set({ token: '', admin: null });
  },
}));

export default useAuthStore;
