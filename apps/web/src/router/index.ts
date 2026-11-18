import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../view/LoginView.vue';
import RegisterView from '../view/RegisterView.vue';
import HomeView from '../view/HomeView.vue';
import QuizView from '../view/QuizView.vue';
import RoomView from '../view/RoomView.vue';
import GameView from '../view/GameView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/register', name: 'register', component: RegisterView },
    { path: '/home', name: 'home', component: HomeView },
    { path: '/quiz', name: 'quiz', component: QuizView },
    { path: '/room/:id', name: 'room', component: RoomView },
    { path: '/game/:id', name: 'game', component: GameView },
  ],
});

export default router;