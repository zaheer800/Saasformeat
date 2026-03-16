import { create } from 'zustand';
import { auth } from '../lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const useAuthStore = create((set, get) => ({
  token: null,
  user: null,
  confirmationResult: null,
  loading: false,
  error: null,

  setToken: (token) => set({ token }),
  setUser: (user) => set({ user }),
  clearError: () => set({ error: null }),

  sendOTP: async (phoneNumber) => {
    set({ loading: true, error: null });
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
        });
      }

      const confirmation = await signInWithPhoneNumber(
        auth,
        phoneNumber,
        window.recaptchaVerifier
      );

      set({ confirmationResult: confirmation, loading: false });
      return true;
    } catch (err) {
      set({ error: err.message, loading: false });
      // Reset recaptcha on error
      window.recaptchaVerifier = null;
      return false;
    }
  },

  verifyOTP: async (otp) => {
    const { confirmationResult } = get();
    set({ loading: true, error: null });
    try {
      const result = await confirmationResult.confirm(otp);
      const token = await result.user.getIdToken();
      set({ token, user: result.user, loading: false });
      return true;
    } catch (err) {
      set({ error: 'Invalid OTP. Please try again.', loading: false });
      return false;
    }
  },

  logout: () => {
    auth.signOut();
    set({ token: null, user: null, confirmationResult: null });
  },

  initTokenRefresh: () => {
    auth.onIdTokenChanged(async (user) => {
      if (user) {
        const token = await user.getIdToken();
        set({ token, user });
      } else {
        set({ token: null, user: null });
      }
    });
  },
}));

export default useAuthStore;
