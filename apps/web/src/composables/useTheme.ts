import { onMounted, ref } from "vue";

export type Theme = "light" | "dark" | "system";

const storageKey = "splitfinpulse-theme";
const theme = ref<Theme>("system");

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(value: Theme): void {
  const isDark =
    value === "dark" || (value === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

export function useTheme() {
  const setTheme = (value: Theme): void => {
    theme.value = value;
    localStorage.setItem(storageKey, value);
    applyTheme(value);
  };

  const cycleTheme = (): void => {
    const nextTheme: Record<Theme, Theme> = {
      system: "light",
      light: "dark",
      dark: "system",
    };
    setTheme(nextTheme[theme.value]);
  };

  onMounted(() => {
    const stored = localStorage.getItem(storageKey);
    theme.value =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
    applyTheme(theme.value);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = (): void => {
      if (theme.value === "system") applyTheme("system");
    };
    mediaQuery.addEventListener("change", handleSystemChange);
  });

  return { theme, setTheme, cycleTheme };
}
