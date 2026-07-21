"use client"

import { Hero } from "@/components/home/hero"
import { LatestReleases } from "@/components/home/latest-releases"
import { TopAnnotations } from "@/components/home/top-annotated-records"
import { AnnotationSourcesOverview } from "@/components/home/annotation-sources-overview"
import { BuscoCompletenessSection } from "@/components/home/busco-completeness-section"
import { FeaturesSection } from "@/components/home/features-section"
import { CommunityRegistrySection } from "@/components/home/community-registry-section"
import { HomeFooter } from "@/components/home/home-footer"
import { UsageTeaserSection } from "@/components/home/usage-teaser-section"
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
        <AnnotationSourcesOverview
          title="A central hub for annotations"
          description={
            <>
              Annotrieve aggregates annotations weekly from{" "}
              <span className="font-medium">Ensembl</span>,{" "}
              <span className="font-medium">NCBI RefSeq</span>,{" "}
              <span className="font-medium">NCBI GenBank</span>, and the{" "}
              <span className="font-medium">Community Registry</span>.
            </>
          }
        />
      </SectionWrapper>

      <SectionWrapper id="busco-completeness" backgroundVariant="muted">
        <BuscoCompletenessSection
          title="BUSCO completeness"
          description="We use BUSCO (version 6.0.0) with eukaryota_odb12 lineage (129 genes) to compute the completeness of the annotations."
        />
      </SectionWrapper>

      <SectionWrapper id="latest-releases" backgroundVariant="default">
        <LatestReleases
          title="Explore recent releases"
          description="Browse newly released assemblies and jump straight into their annotations."
        />
      </SectionWrapper>

      <SectionWrapper id="top-annotations" backgroundVariant="muted">
        <TopAnnotations
          onFilterSelect={handleFilterSelect}
          title="Top annotated records"
          description="See organisms, classes, and assemblies with the most annotations and start exploring from there."
        />
      </SectionWrapper>

      <SectionWrapper id="usage" backgroundVariant="default">
        <UsageTeaserSection />
      </SectionWrapper>

      <SectionWrapper id="community-registry" backgroundVariant="muted" className="scroll-mt-20">
        <CommunityRegistrySection />
      </SectionWrapper>

      <HomeFooter />
    </>
  )
}
