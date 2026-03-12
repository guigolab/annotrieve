"use client"

import Link from "next/link"
import { Github, Sun, Moon, Shield, Menu, HelpCircle, BookOpen, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUIStore } from "@/lib/stores/ui"

export function AppHeader() {
  const theme = useUIStore((state) => state.theme)
  const toggleTheme = useUIStore((state) => state.toggleTheme)

  return (
    <header className="border-b bg-card sticky top-0 z-10">
      <div className="flex items-center justify-center lg:justify-between flex-wrap px-6 py-4 gap-4">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <h1 className="text-2xl font-bold text-foreground whitespace-nowrap">Annotrieve</h1>
        </Link>

        <nav className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/faqs/">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  FAQs
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/api-docs/">
                  <BookOpen className="mr-2 h-4 w-4" />
                  API Docs
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/privacy/">
                  <Shield className="mr-2 h-4 w-4" />
                  Privacy Policy
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href="https://forms.gle/yQWNKVhEJwAEFYaC6"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Feedback Form
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href="https://github.com/emiliorighi/annotrieve"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="mr-2 h-4 w-4" />
                  GitHub Repo
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  )
}
