import { createRouter, createWebHistory } from "vue-router";
import AppShell from "@/components/AppShell.vue";
import { queryClient, sessionQueryOptions } from "@/lib/query-client";
import AuthCallbackView from "@/views/AuthCallbackView.vue";
import DataSettingsView from "@/views/DataSettingsView.vue";
import LoginView from "@/views/LoginView.vue";
import OverviewView from "@/views/OverviewView.vue";
import PlaceholderView from "@/views/PlaceholderView.vue";
import ProfileSettingsView from "@/views/ProfileSettingsView.vue";
import ReactivateView from "@/views/ReactivateView.vue";
import SecuritySettingsView from "@/views/SecuritySettingsView.vue";
import FriendsView from "@/views/FriendsView.vue";
import FriendInvitationView from "@/views/FriendInvitationView.vue";
import CreateGroupView from "@/views/CreateGroupView.vue";
import GroupDetailView from "@/views/GroupDetailView.vue";
import GroupInvitationView from "@/views/GroupInvitationView.vue";
import GroupSettingsView from "@/views/GroupSettingsView.vue";
import GroupsView from "@/views/GroupsView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: { guestOnly: true },
    },
    {
      path: "/auth/callback",
      name: "auth-callback",
      component: AuthCallbackView,
    },
    {
      path: "/account/reactivate",
      name: "reactivate",
      component: ReactivateView,
    },
    {
      path: "/invite/:token",
      name: "friend-invitation",
      component: FriendInvitationView,
    },
    {
      path: "/group-invite/:token",
      name: "group-invitation",
      component: GroupInvitationView,
    },
    {
      path: "/",
      component: AppShell,
      meta: { requiresAuth: true },
      children: [
        { path: "", name: "overview", component: OverviewView },
        {
          path: "friends",
          name: "friends",
          component: FriendsView,
          meta: { title: "Friends" },
        },
        {
          path: "groups",
          name: "groups",
          component: GroupsView,
          meta: { title: "Groups" },
        },
        {
          path: "groups/new",
          name: "create-group",
          component: CreateGroupView,
          meta: { title: "Create group" },
        },
        {
          path: "groups/:groupId",
          name: "group-detail",
          component: GroupDetailView,
          meta: { title: "Group" },
        },
        {
          path: "groups/:groupId/settings",
          name: "group-settings",
          component: GroupSettingsView,
          meta: { title: "Group settings" },
        },
        {
          path: "activity",
          name: "activity",
          component: PlaceholderView,
          meta: { title: "Activity" },
        },
        { path: "settings", redirect: "/settings/profile" },
        {
          path: "settings/profile",
          name: "profile",
          component: ProfileSettingsView,
          meta: { title: "Profile" },
        },
        {
          path: "settings/security",
          name: "security",
          component: SecuritySettingsView,
          meta: { title: "Security" },
        },
        {
          path: "settings/data",
          name: "data",
          component: DataSettingsView,
          meta: { title: "Account data" },
        },
      ],
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

router.beforeEach(async (to) => {
  if (to.matched.some((record) => record.meta.requiresAuth)) {
    try {
      await queryClient.ensureQueryData(sessionQueryOptions);
    } catch {
      return { name: "login", query: { returnTo: safeReturnTo(to.fullPath) } };
    }
  }
  if (to.meta.guestOnly) {
    try {
      await queryClient.ensureQueryData(sessionQueryOptions);
      return { name: "overview" };
    } catch {
      return true;
    }
  }
  return true;
});
