import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../view/LoginView.vue';
import RegisterView from '../view/RegisterView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/register', name: 'register', component: RegisterView },
  ],
});

export default router;

