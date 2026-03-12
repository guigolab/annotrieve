"use client"

import { Hero } from "@/components/home/hero"
import { LatestReleases } from "@/components/home/latest-releases"
import { TopAnnotations } from "@/components/home/top-annotated-records"
import { DatabaseFrequencies } from "@/components/home/database-frequencies"
import { ReleaseDateChart } from "@/components/home/release-date-chart"
import { FeaturesSection } from "@/components/home/features-section"
import { UserAnalyticsMap } from "@/components/home/user-analytics-map"
import { SectionWrapper } from "@/components/ui/section-wrapper"


export default function Home() {
  const handleFilterSelect = () => {
    // This now does nothing as SearchBar handles navigation directly
  }

  return (
    <>
      <Hero />

      <SectionWrapper id="features" backgroundVariant="muted">
        <FeaturesSection
          title="Features overview"
          description={
            <>
              Explore annotations with our comprehensive suite of tools. From browsing genomes to comparing statistics, Annotrieve provides everything you need for eukaryotic annotation analysis.
            </>
          }
        />
      </SectionWrapper>
      <SectionWrapper id="database-frequencies" backgroundVariant="default">
        <DatabaseFrequencies
          title="A central hub for annotations"
          description={
            <>
              Annotrieve aggregates annotations weekly from{" "}
              <span className="font-medium">Ensembl</span>,{" "}
              <span className="font-medium">NCBI RefSeq</span>, and{" "}
              <span className="font-medium">NCBI GenBank</span>. Explore the current distribution and download the raw TSVs.
            </>
          }
        />
      </SectionWrapper>
      <SectionWrapper id="release-timeline" backgroundVariant="muted">
        <ReleaseDateChart
          title="Cumulative annotation release timeline"
          description={
            <>
              Track the cumulative growth of annotation releases over time across{" "}
              <span className="font-medium">Ensembl</span>,{" "}
              <span className="font-medium">NCBI RefSeq</span>, and{" "}
              <span className="font-medium">NCBI GenBank</span>. Each line shows the total number of annotations released up to that year, with each database accumulating independently.
            </>
          }
        />
      </SectionWrapper>

      <SectionWrapper id="latest-releases" backgroundVariant="default">
        <LatestReleases
          title="Explore recent releases"
          description="Browse newly released assemblies and jump straight into their annotations."
        />
      </SectionWrapper>

      <SectionWrapper id="top-annotations" backgroundVariant="default">
        <TopAnnotations
          onFilterSelect={handleFilterSelect}
          title="Top annotated records"
          description="See organisms, classes, and assemblies with the most annotations and start exploring from there."
        />
      </SectionWrapper>
    </>
  )
}
