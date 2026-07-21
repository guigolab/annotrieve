"use client"

import Link from "next/link"
import { ArrowRight, Globe } from "lucide-react"
import { SectionHeader } from "@/components/ui/section-header"
import { Button } from "@/components/ui/button"

/** Homepage teaser — full adoption dashboard lives on /usage. */
export function UsageTeaserSection() {
  return (
    <div className="container mx-auto px-4 py-12">
      <SectionHeader
        title="Public usage"
        description={
          <>
            See how many people use Annotrieve worldwide — unique users with API activity, where they
            are, and what they open. Anonymous and country-level only.
          </>
        }
        icon={Globe}
        iconColor="text-primary"
        iconBgColor="bg-primary/10"
        align="center"
      />
      <div className="flex justify-center">
        <Button asChild size="lg" className="gap-2 rounded-xl">
          <Link href="/usage">
            See public usage
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  )
}
