import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../view/LoginView.vue';
import RegisterView from '../view/RegisterView.vue';
import HomeView from '../view/HomeView.vue';
import RoomView from '../view/RoomView.vue';
import GameView from '../view/GameView.vue';
import { isSessionValid } from '../services/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: LoginView, meta: { guestOnly: true } },
    { path: '/register', name: 'register', component: RegisterView, meta: { guestOnly: true } },
    { path: '/home', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/room/:id', name: 'room', component: RoomView, meta: { requiresAuth: true } },
  ],
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isSessionValid()) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && isSessionValid()) {
    return { name: 'home' };
  }
  return true;
});

export default router;