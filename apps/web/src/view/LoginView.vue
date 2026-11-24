<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { loginUser, storeSession } from '../services/auth';

const router = useRouter();
const form = reactive({ email: '', password: '' });
const error = ref('');
const loading = ref(false);

async function submit() {
  try {
    loading.value = true;
    error.value = '';
    const session = await loginUser({ email: form.email, password: form.password });
    storeSession(session);
    router.push('/home');
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Connexion impossible.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card">
      <h1>Connexion</h1>
      <form @submit.prevent="submit">
        <label>
          <span>Email</span>
          <input v-model="form.email" type="email" placeholder="votre@email.com" required />
        </label>

        <label>
          <span>Mot de passe</span>
          <input v-model="form.password" type="password" placeholder="••••••••" required />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" :disabled="loading">
          {{ loading ? 'Connexion...' : 'Se connecter' }}
        </button>
      </form>

      <p class="switch">
        Pas encore de compte ?
        <router-link to="/register">Créer un compte</router-link>
      </p>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #f5f7ff, #eef7f2);
  font-family: Arial, sans-serif;
}

.auth-card {
  width: min(420px, calc(100vw - 2rem));
  background: white;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
}

h1 {
  margin: 0 0 1.5rem;
  text-align: center;
  color: #1f2937;
}

form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: #374151;
  font-weight: 600;
}

input {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 0.8rem 0.9rem;
  font-size: 1rem;
}

button {
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: white;
  font-weight: 700;
  padding: 0.9rem 1rem;
  cursor: pointer;
}

button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.9rem;
}

.switch {
  margin-top: 1rem;
  text-align: center;
  color: #4b5563;
}

.switch a {
  color: #2563eb;
  text-decoration: none;
  font-weight: 700;
}
</style>
