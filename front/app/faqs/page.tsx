"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card } from "@/components/ui/card"
import { Archive, Link2, Star, Network, Database } from "lucide-react"
import { Button } from "@/components/ui/button"

const pipelineSteps = [
  {
    title: "Retrieve GFF filepaths",
    description:
      "Scan FTP sites from GenBank, RefSeq, and Ensembl to catalogue every available eukaryotic annotation.",
  },
  {
    title: "Download GFF files",
    description: "Fetch each referenced GFF3 file directly from the upstream mirror for processing.",
  },
  {
    title: "Sort annotations",
    description: "Order features by chromosome and coordinate to guarantee deterministic query behavior.",
  },
  {
    title: "BGZip compression",
    description: "Compress the sorted files with BGZip so they remain random-access friendly.",
  },
  {
    title: "CSI indexing",
    description: "Generate CSI indexes that power region-based queries and streaming downloads.",
  },
  {
    title: "Index taxonomic data",
    description: "Capture each annotation’s lineage and relationships to unlock tree-based filtering.",
  },
  {
    title: "Index assemblies",
    description: "Extract assembly metadata—levels, statuses, chromosomes, and statistics—and link it back to annotations.",
  },
  {
    title: "Map region names",
    description: "Normalize chromosome aliases so queries stay consistent across all data sources.",
  },
]


type FAQItem = {
  value: string
  question: string
  renderContent: () => ReactNode
}

const faqItems: FAQItem[] = [

  {
    value: "what-is",
    question: "What is Annotrieve?",
    renderContent: () => (
      <>
        <p>
          Annotrieve is a unified platform for accessing and analyzing eukaryotic genome annotations from multiple
          sources including NCBI RefSeq, GenBank, and Ensembl.
        </p>
        <p>
          We process, index, and serve GFF3 annotation files in a standardized format, making it easy to discover,
          filter, download, and visualize genome annotations across thousands of species.
        </p>
      </>
    ),
  },
  {
    value: "data-sources",
    question: "What data sources does Annotrieve use?",
    renderContent: () => (
      <>
        <p>Annotrieve integrates annotations from three major sources:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>NCBI RefSeq</strong> – curated reference sequences
          </li>
          <li>
            <strong>NCBI GenBank</strong> – community-submitted sequences
          </li>
          <li>
            <strong>Ensembl</strong> – automated genome annotation database
          </li>
        </ul>
        <p>All annotations are automatically synchronized and updated from these sources.</p>
      </>
    ),
  },
  {
    value: "pipeline",
    question: "How does the data integration pipeline work?",
    renderContent: () => (
      <>
        <p>
          Annotrieve runs a deterministic ingestion pipeline so annotations from RefSeq, GenBank, and Ensembl behave
          the same way inside the platform.
        </p>
        <ol className="list-decimal pl-6 space-y-3">
          {pipelineSteps.map((step) => (
            <li key={step.title} className="space-y-1">
              <p className="font-semibold text-foreground">{step.title}</p>
              <p className="text-sm">{step.description}</p>
            </li>
          ))}
        </ol>
        <p>Each stage is monitored and validated so downstream queries and downloads stay reliable.</p>
      </>
    ),
  },
  {
    value: "stats",
    question: "How are statistics computed?",
    renderContent: () => (
      <>
        <p>
          Our statistics service streams annotations once, classifies every gene, and records summary metrics while the
          data flows by.
        </p>
        <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-semibold text-foreground">Gene categorization logic</p>
          <p>
            Each top-level feature (root) passes through <code>categorize_roots</code>, which inspects the feature type,
            biotype, and structural hints:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Pseudogene:</strong> tags any root whose feature type is exactly <code>pseudogene</code>.
            </li>
            <li>
              <strong>Coding:</strong> marks roots that either contain CDS segments or advertise{" "}
              <code>protein_coding</code> in their biotype (case-insensitive).
            </li>
            <li>
              <strong>Non-coding:</strong> falls back to roots that have exons but failed the previous checks; this
              bucket currently mixes structured classes such as tRNA, rRNA, lncRNA, miRNA, and more.
            </li>
          </ul>
          <p>
            We are evaluating whether this simplification should be refined so biologically distinct non-coding classes
            remain separate. Please share your expectations or concerns in{" "}
            <a
              href="https://github.com/emiliorighi/annotrieve/issues/3"
              className="text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub issue #3
            </a>{" "}
            to help us decide the next steps.
          </p>
        </div>
      </>
    ),
  },

  {
    value: "how-to-download",
    question: "How do I download annotations?",
    renderContent: () => (
      <>
        <ol className="list-decimal pl-6 space-y-2">
          <li>Browse or search for annotations using the search bar or filters.</li>
          <li>Open the menu on the top-right of the annotation card.</li>
          <li>Select <strong>Download</strong> to retrieve the GFF </li>
        </ol>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
        <Card className="p-6 border-border/50">
          <div className="flex items-center gap-3 mb-3">
            <Link2 className="w-5 h-5 text-primary" />
            <h4 className="font-semibold">Source URL</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Download the original file directly from Ensembl, RefSeq, or GenBank for full fidelity and provenance.
          </p>
          <Button variant="outline" className="w-full" disabled>
            Example: provider.org/path/to/file.gff3
          </Button>
        </Card>

        <Card className="p-6 border-border/50">
          <div className="flex items-center gap-3 mb-3">
            <Archive className="w-5 h-5 text-primary" />
            <h4 className="font-semibold">Processed bgzip + CSI</h4>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Use the bgzipped and indexed copy for fast random access, region queries, and seamless tooling.
          </p>
          <div className="grid grid-cols-1 gap-2">
            <Button variant="outline" className="w-full" disabled>
              example.s3/annotation.gff3.gz
            </Button>
            <Button variant="outline" className="w-full" disabled>
              example.s3/annotation.gff3.gz.csi
            </Button>
          </div>
        </Card>
      </div>
      </>
    ),
  },
  {
    value: "favorites",
    question: "How do favorites work?",
    renderContent: () => (
      <>
        <p>
          Use favorites to collect specific annotations while you browse and then export or compare them side by side.
        </p>
        <div className="grid grid-cols-1 gap-4">
          <div className="flex items-start gap-3">
            <Star className="h-5 w-5 text-primary mt-1" />
            <div className="space-y-2">
              <p className="font-semibold text-foreground">Add annotations</p>
              <p className="text-sm">
                Click the star icon on the top-right corner of any annotation card. The star fills to confirm the item is
                now in your favorites list.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Star className="h-5 w-5 text-primary mt-1" />
            <div className="space-y-2">
              <p className="font-semibold text-foreground">Open the floating favorites button</p>
              <p className="text-sm">
                A circular star button appears in the lower-right corner of the screen. Click it to open the favorites
                modal, review saved annotations, and clear selections.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Star className="h-5 w-5 text-primary mt-1" />
            <div className="space-y-2">
              <p className="font-semibold text-foreground">Jump to favorites only</p>
              <p className="text-sm">
                From the modal, choose “View favorites” to open the dedicated comparison page at <code>/annotations/favorites</code>,
                which focuses solely on your curated annotations.
              </p>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    value: "api-access",
    question: "Can I access data programmatically?",
    renderContent: () => (
      <>
        <p>Yes. Annotrieve provides a comprehensive REST API for programmatic access.</p>
        <p>
          <strong>Key features:</strong>
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Query and filter annotations by taxonomy, assembly, biotype, feature type, and more</li>
          <li>Stream GFF data for specific genomic regions</li>
          <li>Get frequency counts and statistics</li>
          <li>Download bulk annotation sets</li>
        </ul>
        <p>
          View the interactive <Link href="/api-docs" className="text-primary underline-offset-4 hover:underline">
            API documentation
          </Link>{" "}
          to explore all available endpoints.
        </p>
      </>
    ),
  },
  {
    value: "jbrowse",
    question: "How does JBrowse integration work?",
    renderContent: () => (
      <>
        <p>Annotrieve integrates with JBrowse2 to provide interactive visualization of annotations.</p>
        <p>
          <strong>Features:</strong>
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>View annotations in their genomic context</li>
          <li>Navigate chromosomes and regions</li>
          <li>Compare multiple annotation tracks</li>
        </ul>
        <p>Use the “View in JBrowse” button on any assembly details modal card to open the genome browser. Only chromosome or complete genome assemblies are supported.</p>
      </>
    ),
  },
  {
    value: "filtering",
    question: "How do I filter and browse annotations?",
    renderContent: () => (
      <>
        <p>
          Combine taxonomy, assembly, and metadata filters to shrink the result set, then interact with the active filter
          chips to jump into specific entities.
        </p>
        <ol className="list-decimal pl-6 space-y-3">
          <li>
            <p className="font-semibold text-foreground">Choose a taxon</p>
            <p className="text-sm">
              Use the taxonomy tree or quick search inside the sidebar to select a species or higher
              rank. Each selection appears as a chip beneath the page header.
            </p>
          </li>
          <li>
            <p className="font-semibold text-foreground">Include or exclude assemblies</p>
            <p className="text-sm">
              Switch to the Assemblies section to constrain levels/statuses or filter by reference genomes only. Optionally you can browse the assemblies via the "View assemblies" button in the header of the page.
              Selected assemblies will also surface as chips you can clear at any time.
            </p>
          </li>
          <li>
            <p className="font-semibold text-foreground">Layer additional filters</p>
            <p className="text-sm">
              Add biotypes, feature types, pipelines, providers, or database sources to focus on the annotation slices
              that matter for your analysis.
            </p>
          </li>
        </ol>
        <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-semibold text-foreground">Interactive chips</p>
          <p>
            Every active filter is rendered as a chip (just like in the annotations page). Click a chip to open the
            related taxon or assembly details panel; use the × icon to remove it without reopening the sidebar.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-sm text-foreground">
              <Network className="h-3.5 w-3.5" />
              Homo sapiens
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-sm text-foreground">
              <Database className="h-3.5 w-3.5" />
              GCF_000001405.40
            </span>
          </div>
          <p>
            Need a clean slate? Click <em>Clear all</em> next to the chips to reset every filter at once.
          </p>
        </div>
      </>
    ),
  },
  {
    value: "privacy-data",
    question: "What data do we collect and how is it used?",
    renderContent: () => (
      <>
        <p>
          Annotrieve collects minimal server-side logs for usage analytics and service improvement. We do not use tracking cookies or client-side analytics.
        </p>
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-foreground mb-2">Data collected:</p>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li><strong>IP addresses</strong> – Used to understand usage patterns and prevent abuse</li>
              <li><strong>User agent</strong> – Browser/client information for compatibility analysis</li>
              <li><strong>Referrer</strong> – Source of requests (e.g., which page linked to the API)</li>
              <li><strong>Request details</strong> – API endpoints accessed, HTTP methods, timestamps, response times</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-2">Purpose:</p>
            <p className="text-sm">
              Logs are used exclusively for usage tracking, service optimization, and understanding how the platform is used for research purposes. This is not used for commercial purposes or shared with third parties.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-2">Data retention:</p>
            <p className="text-sm">
              Logs are retained for a reasonable period necessary for analytics and troubleshooting. Specific retention periods may vary based on operational needs.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-2">Your rights:</p>
            <p className="text-sm">
              If you have questions about data collection or wish to request information about your data, please contact us at{" "}
              <a href="mailto:emilio.righi@crg.eu" className="text-primary underline-offset-4 hover:underline">
                emilio.righi@crg.eu
              </a>
              .
            </p>
          </div>
        </div>
      </>
    ),
  },
  {
    value: "contact",
    question: "How can I get support or report issues?",
    renderContent: () => (
      <>
        <p>We are happy to help:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>GitHub issues:</strong>{" "}
            <a
              href="https://github.com/emiliorighi/annotrieve/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              report bugs or request features
            </a>
          </li>
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:emilio.righi@crg.eu" className="text-primary underline-offset-4 hover:underline">
              emilio.righi@crg.eu
            </a>
          </li>
          <li>
            <strong>API questions:</strong>{" "}
            <Link href="/api-docs" className="text-primary underline-offset-4 hover:underline">
              consult the API documentation
            </Link>
          </li>
        </ul>
      </>
    ),
  },
]

export default function FAQsPage() {
  return (
    <div className="min-h-full overflow-y-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
        {/* Page Title */}
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
          <p className="text-lg text-muted-foreground">
            Learn how Annotrieve works and how to use the platform effectively
          </p>
        </header>

        {/* FAQ Accordion */}
        <Accordion type="multiple" className="w-full space-y-4">
          {faqItems.map((item) => (
            <AccordionItem key={item.value} value={item.value} className="rounded-lg border px-6">
              <AccordionTrigger className="text-xl font-semibold hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="space-y-4 text-muted-foreground">{item.renderContent()}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        </div>
      </div>
    </div>
  )
}