"use client"

import Link from "next/link"
import Image from "next/image"
import {
  HelpCircle,
  BookOpen,
  Shield,
  MessageSquare,
  Github,
  Mail,
} from "lucide-react"
import { cn } from "@/lib/utils"

const RESOURCE_LINKS = [
  { href: "/faqs/", label: "FAQs", icon: HelpCircle },
  { href: "/api-docs/", label: "API Docs", icon: BookOpen },
  { href: "/privacy/", label: "Privacy Policy", icon: Shield },
]

const EXTERNAL_LINKS = [
  { href: "https://github.com/emiliorighi/annotrieve", label: "GitHub", icon: Github },
  { href: "https://forms.gle/yQWNKVhEJwAEFYaC6", label: "Feedback", icon: MessageSquare },
]

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/annotrieve"

const CONTACT_EMAILS = [
  { label: "Support", email: "emilio.righi@crg.eu" },
  { label: "General inquiries", email: "fabio.zanarello@crg.eu" },
]

const FooterLink = ({
  href,
  children,
  external = false,
}: {
  href: string
  children: React.ReactNode
  external?: boolean
}) => {
  const className = cn(
    "relative text-sm font-medium transition-colors pb-0.5",
    "after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:transition-transform after:duration-200",
    "text-muted-foreground hover:text-foreground after:bg-muted-foreground hover:after:scale-x-100"
  )
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return <Link href={href} className={className}>{children}</Link>
}

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    {children}
  </h3>
)

export function HomeFooter() {
  return (
    <footer className="border-t bg-background/80">
      <div className="mx-auto px-6 py-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">

          {/* Brand */}
          <div className="flex items-center">
            <Image
              src={`${BASE_PATH}/crg-logo.png`}
              alt="Host institution logo"
              width={128}
              height={56}
              className="h-20 w-auto object-contain"
            />
          </div>

          {/* Resources */}
          <div>
            <SectionHeading>Resources</SectionHeading>
            <ul className="space-y-2">
              {RESOURCE_LINKS.map(({ href, label, icon: Icon }) => (
                <li key={label}>
                  <FooterLink href={href}>
                    <Icon className="mr-1.5 inline-block h-3.5 w-3.5" />
                    {label}
                  </FooterLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <SectionHeading>Connect</SectionHeading>
            <ul className="space-y-2">
              {EXTERNAL_LINKS.map(({ href, label, icon: Icon }) => (
                <li key={label}>
                  <FooterLink href={href} external>
                    <Icon className="mr-1.5 inline-block h-3.5 w-3.5" />
                    {label}
                  </FooterLink>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <SectionHeading>Contact</SectionHeading>
            <ul className="space-y-3">
              {CONTACT_EMAILS.map(({ label, email }) => (
                <li key={email} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <a
                    href={`mailto:${email}`}
                    className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {email}
                  </a>
                </li>
              ))}
            </ul>
          </div>

        </div>

        <div className="mt-8 border-t border-border pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            © {new Date().getFullYear()}{" "}
            <span className="font-bold tracking-tight bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Annotrieve
            </span>
          </span>
          <span>
            <a
              href="https://www.genome.crg.cat"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Roderic Guigo Lab
            </a>
            {" · "}
            <a
              href="https://www.crg.eu"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Centre for Genomic Regulation (CRG)
            </a>
            {", Barcelona"}
          </span>
        </div>
      </div>
    </footer>
  )
}
