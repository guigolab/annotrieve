"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Github, Sun, Moon, Shield, HelpCircle, BookOpen, MessageSquare, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUIStore } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"

const NavLink = ({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) => (
  <Link
    href={href}
    className={cn(
      "relative text-sm font-medium transition-colors pb-0.5",
      "after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:transition-transform after:duration-200",
      active
        ? "text-foreground after:scale-x-100 after:bg-primary"
        : "text-muted-foreground hover:text-foreground after:bg-muted-foreground hover:after:scale-x-100"
    )}
  >
    {children}
  </Link>
)

export function AppNavbar() {
  const pathname = usePathname()
  const theme = useUIStore((state) => state.theme)
  const toggleTheme = useUIStore((state) => state.toggleTheme)

  const isAnnotations = pathname === "/annotations" || pathname.startsWith("/annotations/")
  const isTaxonomy = pathname === "/taxonomy" || pathname.startsWith("/taxonomy")

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md"
    >
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="hover:opacity-75 transition-opacity">
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Annotrieve
            </span>
          </Link>

          <div className="hidden sm:flex items-center gap-6" role="navigation" aria-label="Main pages">
            <NavLink href="/annotations" active={isAnnotations}>Annotations</NavLink>
            <NavLink href="/taxonomy" active={isTaxonomy}>Taxonomy</NavLink>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="sr-only">Toggle theme</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="More"
              >
                <span className="sr-only">Open menu</span>
                <span className="flex flex-col gap-[3px] items-center justify-center">
                  <span className="block h-px w-3.5 bg-current rounded-full" />
                  <span className="block h-px w-3.5 bg-current rounded-full" />
                  <span className="block h-px w-3.5 bg-current rounded-full" />
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link href="/faqs/" className="flex items-center gap-2">
                  <HelpCircle className="h-3.5 w-3.5" />
                  FAQs
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/api-docs/" className="flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5" />
                  API Docs
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href="https://github.com/apollo994/annocli"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  CLI (annocli)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/privacy/" className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5" />
                  Privacy Policy
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href="https://forms.gle/yQWNKVhEJwAEFYaC6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Feedback
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href="https://github.com/emiliorighi/annotrieve"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <Github className="h-3.5 w-3.5" />
                  GitHub
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}
