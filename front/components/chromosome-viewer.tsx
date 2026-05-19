"use client"

import { useEffect, useState } from 'react';
import { getAssembly } from '@/lib/api/assemblies';
import { fetchChromosomesFromFiles, type ChromosomeFileRow } from '@/lib/api/files';

/** Visualize related chromosomes for an assembly; lengths appear on hover. */
interface ChromosomeInterface {
  accession_version: string;
  chr_name: string;
  length: number;
  aliases: string[];
}

interface ChromosomeViewerProps {
  accession: string;
}

export function ChromosomeViewer({ accession }: ChromosomeViewerProps) {
  const [chromosomes, setChromosomes] = useState<ChromosomeInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const svgHeight = 120;

  useEffect(() => {
    const fetchChromosomes = async () => {
      try {
        setLoading(true);
        setError(null);

        const assembly = await getAssembly(accession);
        const rows = await fetchChromosomesFromFiles(
          assembly.taxid,
          accession,
          assembly.paired_assembly_accession,
        );

        const mappedChromosomes: ChromosomeInterface[] = rows.map((molecule: ChromosomeFileRow) => ({
          accession_version: molecule.refseq_accession || molecule.genbank_accession || molecule.sequence_name || '',
          chr_name: molecule.chr_name || molecule.sequence_name || '',
          length: molecule.length || 0,
          aliases: [
            molecule.chr_name,
            molecule.sequence_name,
            molecule.ucsc_style_name,
            molecule.genbank_accession,
            molecule.refseq_accession,
          ].filter((v): v is string => Boolean(v)),
        }));

        mappedChromosomes.sort((a, b) => {
          const aNum = parseInt(a.chr_name.replace(/\D/g, ''));
          const bNum = parseInt(b.chr_name.replace(/\D/g, ''));
          if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
          return a.chr_name.localeCompare(b.chr_name);
        });

        setChromosomes(mappedChromosomes);
      } catch (err) {
        console.error('Error fetching chromosomes:', err);
        setError('Failed to load chromosomes');
      } finally {
        setLoading(false);
      }
    };

    if (accession) {
      fetchChromosomes();
    }
  }, [accession]);

  const formatLength = (length: number) => {
    if (length >= 1_000_000) {
      return `${(length / 1_000_000).toFixed(1)}M`;
    }
    return `${(length / 1_000).toFixed(0)}k`;
  };

  const MAX_HEIGHT = 120;
  const maxLength = chromosomes.reduce((max, c) => Math.max(max, c.length), 0);

  if (loading) {
    return (
      <div className="chromosome-viewer flex items-center justify-center" style={{ height: svgHeight }}>
        <div className="text-sm text-muted-foreground">Loading chromosomes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chromosome-viewer flex items-center justify-center" style={{ height: svgHeight }}>
        <div className="text-sm text-destructive">{error}</div>
      </div>
    );
  }

  if (chromosomes.length === 0) {
    return (
      <div className="chromosome-viewer flex items-center justify-center" style={{ height: svgHeight }}>
        <div className="text-sm text-muted-foreground">No chromosomes found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end justify-center gap-2">
      {chromosomes.map((chr) => {
        const height = Math.max((chr.length / maxLength) * MAX_HEIGHT, 20);

        return (
          <div
            key={chr.chr_name}
            className="flex flex-col items-center gap-1 group"
            title={`${chr.chr_name}: ${formatLength(chr.length)}bp`}
          >
            <div
              className="relative w-4 rounded-t opacity-80 transition-opacity group-hover:opacity-100"
              style={{
                height: `${height}px`,
                backgroundColor: 'var(--primary)',
              }}
            />
            <span className="text-xs font-mono text-muted-foreground">
              {chr.chr_name}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              {formatLength(chr.length)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
