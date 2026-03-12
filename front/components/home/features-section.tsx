"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SectionHeader } from "@/components/ui/section-header"
import { 
  Server, 
  Eye, 
  BarChart3, 
  Star, 
  GitCompare 
} from "lucide-react"
import { ReactNode } from "react"

interface Feature {
  title: string
  description: string
  icon: typeof Server
  iconColor: string
  iconBgColor: string
}

const FEATURES: Feature[] = [
  {
    title: "Centralized Repository",
    description: "Access a unified collection of eukaryotic GFF annotations from NCBI RefSeq, NCBI GenBank, and Ensembl in one convenient location.",
    icon: Server,
    iconColor: "text-blue-600",
    iconBgColor: "bg-blue-500/10",
  },
  {
    title: "Embedded Genome Browser",
    description: "Visualize and explore annotations directly in your browser with our integrated genome browser interface.",
    icon: Eye,
    iconColor: "text-purple-600",
    iconBgColor: "bg-purple-500/10",
  },
  {
    title: "Quick Statistics Lookup",
    description: "Instantly access coding, non-coding, and pseudogene summaries with comprehensive annotation statistics.",
    icon: BarChart3,
    iconColor: "text-green-600",
    iconBgColor: "bg-green-500/10",
  },
  {
    title: "Add to Favorites",
    description: "Save your frequently accessed annotations and assemblies for quick reference and easy navigation.",
    icon: Star,
    iconColor: "text-amber-600",
    iconBgColor: "bg-amber-500/10",
  },
  {
    title: "Compare Statistics",
    description: "Compare annotation statistics side-by-side between multiple assemblies to analyze differences and similarities.",
    icon: GitCompare,
    iconColor: "text-red-600",
    iconBgColor: "bg-red-500/10",
  },
]

interface FeatureCardProps {
  feature: Feature
  index: number
}

function FeatureCard({ feature, index }: FeatureCardProps) {
  const Icon = feature.icon
  const delay = `${index * 100}ms`

  return (
    <Card
      className="group relative flex h-full flex-col border-border/60 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-lg hover:border-primary/40 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
      style={{
        animationDelay: delay,
        animationDuration: "600ms",
        animationFillMode: "both",
      }}
    >
      <CardHeader className="pb-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className={`p-3 rounded-xl transition-all duration-300 group-hover:scale-110 flex-shrink-0 ${feature.iconBgColor}`}
          >
            <Icon className={`h-6 w-6 ${feature.iconColor}`} />
          </div>

          {/* Title & description */}
          <div className="min-w-0 space-y-2 flex-1">
            <CardTitle className="text-xl font-semibold leading-tight group-hover:text-primary transition-colors duration-300">
              {feature.title}
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed text-muted-foreground">
              {feature.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      {/* Hover indicator */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </Card>
  )
}

interface FeaturesSectionProps {
  title?: string
  description?: ReactNode
}

export function FeaturesSection({ title, description }: FeaturesSectionProps) {
  return (
    <div className="container mx-auto px-4 py-16">
      <SectionHeader
        title={title ?? "Powerful Features"}
        description={
          description ?? (
            <>
              Annotrieve provides a comprehensive suite of tools for exploring, analyzing, and comparing eukaryotic genome annotations from multiple trusted sources.
            </>
          )
        }
        icon={BarChart3}
        iconColor="text-primary"
        iconBgColor="bg-primary/10"
        align="center"
      />

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {FEATURES.map((feature, index) => (
          <FeatureCard key={feature.title} feature={feature} index={index} />
        ))}
      </div>
    </div>
  )
}

