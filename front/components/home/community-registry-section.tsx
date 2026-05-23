"use client"

import { ReactNode } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/ui/section-header"
import {
  BookOpen,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  GitPullRequest,
  Github,
} from "lucide-react"

const REGISTRY_URL = "https://github.com/guigolab/annotrieve-registry"
const CONTRIBUTING_URL = `${REGISTRY_URL}/blob/master/CONTRIBUTING.md`

const STEPS = [
  {
    title: "Add your project",
    description: "One folder with manifest.yaml and annotations.tsv (assemblies + GFF3 links).",
    icon: FileSpreadsheet,
    iconColor: "text-teal-600",
    iconBgColor: "bg-teal-500/10",
  },
  {
    title: "Submit a pull request",
    description: "Open a PR on GitHub. Automated checks review your files and GFF3 links.",
    icon: GitPullRequest,
    iconColor: "text-violet-600",
    iconBgColor: "bg-violet-500/10",
  },
  {
    title: "On Annotrieve later",
    description: "We’re collecting entries now. They’ll show up in Annotrieve once import is ready.",
    icon: Clock,
    iconColor: "text-amber-600",
    iconBgColor: "bg-amber-500/10",
  },
] as const

interface CommunityRegistrySectionProps {
  title?: string
  description?: ReactNode
}

export function CommunityRegistrySection({
  title = "Publish your gene annotations",
  description,
}: CommunityRegistrySectionProps) {
  return (
    <div className="container mx-auto px-4 py-16">
      <SectionHeader
        title={title}
        description={
          description ?? (
            <>
              List your eukaryotic GFF3 annotations in the{" "}
              <span className="font-medium text-foreground">Annotrieve community registry</span>{" "}
              on GitHub.
            </>
          )
        }
        icon={Github}
        iconColor="text-primary"
        iconBgColor="bg-primary/10"
        align="center"
      />

      <div className="max-w-5xl mx-auto">
        <div className="relative rounded-2xl p-[1px] bg-gradient-to-r from-primary/50 via-secondary/40 to-accent/50 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          <Card className="relative overflow-hidden border-0 bg-card/95 backdrop-blur-sm shadow-xl">
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-accent/[0.08]"
              aria-hidden
            />

            <CardHeader className="relative pb-2 text-center sm:text-left">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2 text-center sm:text-left">
                  <CardTitle className="text-2xl font-semibold tracking-tight">
                    Community registry
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base leading-relaxed max-w-2xl">
                    Fork the repo, add your project, and open a pull request. See{" "}
                    <Link
                      href={CONTRIBUTING_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      CONTRIBUTING.md
                    </Link>{" "}
                    for the full guide and file formats.
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:items-end gap-2 shrink-0 mx-auto sm:mx-0">
                  <Button
                    asChild
                    size="lg"
                    className="gap-2 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.02]"
                  >
                    <Link
                      href={REGISTRY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Github className="h-5 w-5" />
                      View registry
                      <ExternalLink className="h-4 w-4 opacity-70" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="relative pt-4 pb-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {STEPS.map((step, index) => {
                  const Icon = step.icon
                  const delay = `${150 + index * 100}ms`

                  return (
                    <div
                      key={step.title}
                      className="group relative flex flex-col rounded-xl border border-border/60 bg-background/60 p-5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
                      style={{
                        animationDelay: delay,
                        animationDuration: "600ms",
                        animationFillMode: "both",
                      }}
                    >
                      <div
                        className={`mb-4 inline-flex w-fit p-3 rounded-xl transition-transform duration-300 group-hover:scale-110 ${step.iconBgColor}`}
                      >
                        <Icon className={`h-5 w-5 ${step.iconColor}`} />
                      </div>
                      <h3 className="text-base font-semibold mb-2 group-hover:text-primary transition-colors duration-300">
                        {step.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-b-xl" />
                    </div>
                  )
                })}
              </div>
            </CardContent>

            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/0 via-primary/80 to-primary/0" />
          </Card>
        </div>
      </div>
    </div>
  )
}
