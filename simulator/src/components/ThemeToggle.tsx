import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
    const { isDark, toggleTheme } = useTheme();
    return (
        <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-md text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#00a884] transition-colors"
            title={isDark ? 'Usar tema claro' : 'Usar tema escuro'}
            aria-label={isDark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
        >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
    );
}
