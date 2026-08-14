import { createRouter, createWebHistory } from "vue-router";
import OverviewView from "@/views/OverviewView.vue";
import PlaceholderView from "@/views/PlaceholderView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "overview", component: OverviewView },
    {
      path: "/groups",
      name: "groups",
      component: PlaceholderView,
      meta: { title: "Groups" },
    },
    {
      path: "/activity",
      name: "activity",
      component: PlaceholderView,
      meta: { title: "Activity" },
    },
    {
      path: "/settings",
      name: "settings",
      component: PlaceholderView,
      meta: { title: "Settings" },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
