import axios from "axios";
import { useAuthStore } from "../store/authStore";

// Em desenvolvimento com o Expo Go num celular físico, troque "localhost" pelo
// IP da sua máquina na rede local (ex: http://192.168.0.10:3000/api).
// No emulador Android, "localhost" não chega no host — use 10.0.2.2.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";

export const api = axios.create({ baseURL: API_URL });

// Injeta o token JWT salvo no authStore em toda requisição autenticada.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Se o token expirar/for inválido, desloga automaticamente.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
