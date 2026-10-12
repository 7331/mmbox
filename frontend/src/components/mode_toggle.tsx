// shadcn's mode toggle for Vite (https://ui.shadcn.com/docs/dark-mode/vite), sized for a thumb: a 44 px trigger and
// 44 px rows, and ids for browser checks. It sits at the end of the home screen's top bar.
import { Moon, Sun } from "lucide-react"

import { ApplicationButton } from "@/components/application_button"
import { useTheme } from "@/components/theme_provider"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ApplicationButton id="theme_mode_toggle_button" variant="ghost" size="touch" className="w-11 px-0">
          <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </ApplicationButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem id="theme_mode_light_item" className="min-h-11 text-[15px]" onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem id="theme_mode_dark_item" className="min-h-11 text-[15px]" onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem id="theme_mode_system_item" className="min-h-11 text-[15px]" onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
