import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "light" ? "dark" : "light";
  return (
    <button
      aria-label={`Switch to ${nextTheme} mode`}
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Switch to ${nextTheme} mode`}
      type="button"
    >
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
      <span>{theme}</span>
    </button>
  );
}
