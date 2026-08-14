import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { registerSW } from "virtual:pwa-register";
import App from "./App.vue";
import "./assets/main.css";
import { router } from "./router";

registerSW({ immediate: true });

createApp(App).use(createPinia()).use(router).use(VueQueryPlugin).mount("#app");
